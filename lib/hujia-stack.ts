import * as path from 'node:path';
import { Construct } from 'constructs';
import { Annotations, Stack, StackProps, Fn, Duration, RemovalPolicy, CfnOutput, aws_s3 as s3, aws_s3_deployment as deploy, aws_lambda as lambda, aws_logs as logs, aws_iam as iam, aws_ssm as ssm, aws_dynamodb as dynamodb, aws_route53 as route53, aws_route53_targets as targets, aws_certificatemanager as acm, aws_cloudfront as cf, aws_cloudfront_origins as origins } from 'aws-cdk-lib';

export class HujiaStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const root=path.join(__dirname,'..');
    const domain='jh.dliu.com', siteUrl=`https://${domain}`;
    const zone=route53.HostedZone.fromHostedZoneAttributes(this,'Zone',{zoneName:Fn.importValue('MainDomain'),hostedZoneId:Fn.importValue('MainHostedZoneId')});
    const table=new dynamodb.Table(this,'Story',{partitionKey:{name:'pk',type:dynamodb.AttributeType.STRING},sortKey:{name:'sk',type:dynamodb.AttributeType.STRING},billingMode:dynamodb.BillingMode.PAY_PER_REQUEST,pointInTimeRecoverySpecification:{pointInTimeRecoveryEnabled:true},deletionProtection:true,removalPolicy:RemovalPolicy.RETAIN});
    const media=new s3.Bucket(this,'PrivateMedia',{blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,objectOwnership:s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,encryption:s3.BucketEncryption.S3_MANAGED,enforceSSL:true,versioned:true,removalPolicy:RemovalPolicy.RETAIN,cors:[{allowedMethods:[s3.HttpMethods.PUT],allowedOrigins:[siteUrl],allowedHeaders:['content-type'],maxAge:3600}],lifecycleRules:[{prefix:'pending/',expiration:Duration.days(1),noncurrentVersionExpiration:Duration.days(1)},{abortIncompleteMultipartUploadAfter:Duration.days(1)}]});
    // The Entra tenant is shared by every dliu.com app (dliu-com/audit stack). The deploy fails if it is missing, and passes
    // its value as a fallback; the Lambda reads the parameter itself so a change needs no redeploy.
    const tenantParameter='/dliu/entra-tenant-id';
    const tenantId=ssm.StringParameter.valueForStringParameter(this,tenantParameter);
    const api=new lambda.Function(this,'Api',{runtime:lambda.Runtime.NODEJS_22_X,handler:'index.handler',code:lambda.Code.fromAsset(path.join(root,'lambda/api')),timeout:Duration.seconds(20),memorySize:512,reservedConcurrentExecutions:10,environment:{ENTRA_TENANT_ID:tenantId,TENANT_PARAMETER:tenantParameter,SITE_URL:siteUrl,ROOT_DOMAIN:'dliu.com',TABLE_NAME:table.tableName,FILES_BUCKET:media.bucketName,PARAMETER_PREFIX:'/hujia'},logGroup:new logs.LogGroup(this,'ApiLogs',{retention:logs.RetentionDays.THREE_MONTHS,removalPolicy:RemovalPolicy.DESTROY})});
    // Least privilege: only the calls the handler makes. Presigned links are signed with this role, so these grants also
    // bound what any link can do. No DeleteObjectVersion: versioning keeps every past copy of the private media recoverable.
    api.addToRolePolicy(new iam.PolicyStatement({actions:['dynamodb:GetItem','dynamodb:Query','dynamodb:PutItem'],resources:[table.tableArn]}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['s3:GetObject'],resources:['preview/*','trips/*','pending/*'].map(p=>media.arnForObjects(p))}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['s3:PutObject'],resources:['pending/*','trips/*'].map(p=>media.arnForObjects(p))}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['s3:DeleteObject'],resources:[media.arnForObjects('pending/*')]}));
    // Lets HeadObject report a missing upload as 404 rather than 403.
    api.addToRolePolicy(new iam.PolicyStatement({actions:['s3:ListBucket'],resources:[media.bucketArn]}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['ssm:GetParameters'],resources:[this.formatArn({service:'ssm',resource:'parameter',resourceName:'hujia/*'})]}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['ssm:GetParameter'],resources:[this.formatArn({service:'ssm',resource:'parameter',resourceName:tenantParameter.slice(1)})]}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['kms:Decrypt'],resources:['*'],conditions:{StringEquals:{'kms:ViaService':`ssm.${this.region}.amazonaws.com`}}}));
    const url=api.addFunctionUrl({authType:lambda.FunctionUrlAuthType.AWS_IAM});
    const site=new s3.Bucket(this,'Site',{blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,encryption:s3.BucketEncryption.S3_MANAGED,enforceSSL:true,removalPolicy:RemovalPolicy.RETAIN});
    const certificate=new acm.DnsValidatedCertificate(this,'Certificate',{domainName:domain,hostedZone:zone,region:'us-east-1'});
    // Pages under this policy load nothing from S3: guest photos come through CloudFront, and the signed-in pages
    // served by the Lambda send their own CSP (override:false keeps it).
    const securityHeaders:cf.ResponseSecurityHeadersBehavior={contentSecurityPolicy:{contentSecurityPolicy:`default-src 'self'; script-src 'self'; style-src 'self' https://files.dliu.com/dliu.com/ui/; img-src 'self' https://files.dliu.com/dliu.com/; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`,override:false},contentTypeOptions:{override:true},frameOptions:{frameOption:cf.HeadersFrameOption.DENY,override:true},referrerPolicy:{referrerPolicy:cf.HeadersReferrerPolicy.NO_REFERRER,override:true},strictTransportSecurity:{accessControlMaxAge:Duration.days(365),includeSubdomains:false,override:true}};
    const customHeaders=[{header:'X-Robots-Tag',value:'noindex, nofollow',override:true},{header:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=(), usb=()',override:true}];
    const headers=new cf.ResponseHeadersPolicy(this,'Headers',{securityHeadersBehavior:securityHeaders,customHeadersBehavior:{customHeaders}});
    const rewrite=new cf.Function(this,'Route',{runtime:cf.FunctionRuntime.JS_2_0,code:cf.FunctionCode.fromFile({filePath:path.join(root,'lib/routes.cjs')})});
    const functions=[{eventType:cf.FunctionEventType.VIEWER_REQUEST,function:rewrite}];
    // Traffic monitoring (dliu-com/traffic-monitor): visitor ID and city header. Do not log authentication cookies.
    const visitorId=cf.Function.fromFunctionAttributes(this,'VisitorId',{functionArn:Fn.importValue('TrafficVisitorFunctionArn'),functionName:'dliu-visitor-id'});
    const trafficGeo=cf.OriginRequestPolicy.fromOriginRequestPolicyId(this,'TrafficGeo',Fn.importValue('TrafficGeoOriginRequestPolicyId'));
    const siteFunctions=[...functions,{eventType:cf.FunctionEventType.VIEWER_RESPONSE,function:visitorId}];
    const apiOrigin=origins.FunctionUrlOrigin.withOriginAccessControl(url);
    const apiBehavior:cf.BehaviorOptions={origin:apiOrigin,viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,allowedMethods:cf.AllowedMethods.ALLOW_ALL,cachePolicy:cf.CachePolicy.CACHING_DISABLED,originRequestPolicy:cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,responseHeadersPolicy:headers,functionAssociations:siteFunctions};
    // The two reviewed scenery photos on the public entrance come from the private bucket through CloudFront (edge-cached,
    // no Lambda call, no presigned link). The bucket is referenced as imported so CDK does not add its default
    // "CloudFront may read every object" statement; the scoped statement below is the only CloudFront access.
    const guestKeys=['trips/preview/guestSea','trips/preview/guestHarbour'];
    const guestOrigin=origins.S3BucketOrigin.withOriginAccessControl(s3.Bucket.fromBucketAttributes(this,'GuestScenery',{bucketName:media.bucketName,region:this.region}));
    Annotations.of(this).acknowledgeWarning('@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOac','The private bucket policy grants CloudFront only the two guest keys, below.');
    const guestCache=new cf.CachePolicy(this,'GuestSceneryCache',{comment:'jh.dliu.com public scenery photos',minTtl:Duration.days(1),defaultTtl:Duration.days(1),maxTtl:Duration.days(7)});
    const guestHeaders=new cf.ResponseHeadersPolicy(this,'GuestHeaders',{securityHeadersBehavior:securityHeaders,customHeadersBehavior:{customHeaders:[...customHeaders,{header:'Cache-Control',value:'public, max-age=86400',override:true}]},removeHeaders:['x-amz-version-id','x-amz-server-side-encryption']});
    const guestBehavior:cf.BehaviorOptions={origin:guestOrigin,viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,allowedMethods:cf.AllowedMethods.ALLOW_GET_HEAD,cachePolicy:guestCache,responseHeadersPolicy:guestHeaders,functionAssociations:functions};
    // status.dliu.com's /health: no origin request policy, so CloudFront forwards no cookies, Authorization header or
    // query string to the Lambda; the cache key holds nothing, so it runs at most about once a minute per edge.
    const healthCache=new cf.CachePolicy(this,'HealthCache',{comment:'jh.dliu.com /health',minTtl:Duration.seconds(0),defaultTtl:Duration.seconds(60),maxTtl:Duration.seconds(60)});
    const healthBehavior:cf.BehaviorOptions={origin:apiOrigin,viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,allowedMethods:cf.AllowedMethods.ALLOW_GET_HEAD,cachePolicy:healthCache,responseHeadersPolicy:headers,functionAssociations:functions};
    const distribution=new cf.Distribution(this,'Distribution',{comment:'jh.dliu.com private memories',domainNames:[domain],certificate,defaultRootObject:'index.html',minimumProtocolVersion:cf.SecurityPolicyProtocol.TLS_V1_2_2021,priceClass:cf.PriceClass.PRICE_CLASS_ALL,httpVersion:cf.HttpVersion.HTTP2_AND_3,defaultBehavior:{origin:origins.S3BucketOrigin.withOriginAccessControl(site),viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,cachePolicy:cf.CachePolicy.CACHING_OPTIMIZED,originRequestPolicy:trafficGeo,responseHeadersPolicy:headers,functionAssociations:siteFunctions},additionalBehaviors:{'health':healthBehavior,'old-website':apiBehavior,'api/guest/*':guestBehavior,'api/*':apiBehavior,'auth/*':apiBehavior}});
    media.addToResourcePolicy(new iam.PolicyStatement({sid:'CloudFrontReadsOnlyGuestScenery',principals:[new iam.ServicePrincipal('cloudfront.amazonaws.com')],actions:['s3:GetObject'],resources:guestKeys.map(key=>media.arnForObjects(key)),conditions:{StringEquals:{'AWS:SourceArn':distribution.distributionArn}}}));
    (distribution.node.defaultChild as cf.CfnDistribution).addPropertyOverride('DistributionConfig.Logging',{IncludeCookies:false});
    api.addPermission('CloudFrontInvoke',{principal:new iam.ServicePrincipal('cloudfront.amazonaws.com'),action:'lambda:InvokeFunction',sourceArn:distribution.distributionArn,invokedViaFunctionUrl:true});
    // HTML shells stay no-cache. Public JS, CSS and images are invalidated on every deploy, so the edge may keep them longer.
    new deploy.BucketDeployment(this,'PublicCode',{sources:[deploy.Source.asset(path.join(root,'web'))],exclude:['*.html','*.md'],destinationBucket:site,distribution,distributionPaths:['/*'],cacheControl:[deploy.CacheControl.fromString('public, max-age=300, s-maxage=86400, stale-while-revalidate=86400')]});
    new deploy.BucketDeployment(this,'HtmlShell',{sources:[deploy.Source.asset(path.join(root,'web'))],exclude:['*'],include:['*.html'],destinationBucket:site,distribution,distributionPaths:['/*'],cacheControl:[deploy.CacheControl.noCache()]});
    // Machine-readable test instructions (/docs/health.md) for status.dliu.com and AI agents.
    new deploy.BucketDeployment(this,'Markdown',{sources:[deploy.Source.asset(path.join(root,'web'))],exclude:['*'],include:['*.md'],destinationBucket:site,distribution,distributionPaths:['/docs/*'],contentType:'text/markdown; charset=utf-8',cacheControl:[deploy.CacheControl.noCache()]});
    new route53.ARecord(this,'MainA',{zone,recordName:'jh',target:route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))});
    new route53.AaaaRecord(this,'MainAAAA',{zone,recordName:'jh',target:route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))});
    new CfnOutput(this,'SiteUrl',{value:siteUrl});new CfnOutput(this,'FilesBucketName',{value:media.bucketName});new CfnOutput(this,'ApiFunctionName',{value:api.functionName});new CfnOutput(this,'TableName',{value:table.tableName});new CfnOutput(this,'DistributionId',{value:distribution.distributionId});
  }
}
