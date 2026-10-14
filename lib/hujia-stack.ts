import * as path from 'node:path';
import { Construct } from 'constructs';
import { Stack, StackProps, Fn, Duration, RemovalPolicy, CfnOutput, aws_s3 as s3, aws_s3_deployment as deploy, aws_lambda as lambda, aws_logs as logs, aws_iam as iam, aws_dynamodb as dynamodb, aws_route53 as route53, aws_route53_targets as targets, aws_certificatemanager as acm, aws_cloudfront as cf, aws_cloudfront_origins as origins } from 'aws-cdk-lib';

export class HujiaStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const root=path.join(__dirname,'..');
    const domain='jh.dliu.com', siteUrl=`https://${domain}`;
    const zone=route53.HostedZone.fromHostedZoneAttributes(this,'Zone',{zoneName:Fn.importValue('MainDomain'),hostedZoneId:Fn.importValue('MainHostedZoneId')});
    const table=new dynamodb.Table(this,'Story',{partitionKey:{name:'pk',type:dynamodb.AttributeType.STRING},sortKey:{name:'sk',type:dynamodb.AttributeType.STRING},billingMode:dynamodb.BillingMode.PAY_PER_REQUEST,pointInTimeRecoverySpecification:{pointInTimeRecoveryEnabled:true},deletionProtection:true,removalPolicy:RemovalPolicy.RETAIN});
    const media=new s3.Bucket(this,'PrivateMedia',{blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,objectOwnership:s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,encryption:s3.BucketEncryption.S3_MANAGED,enforceSSL:true,versioned:true,removalPolicy:RemovalPolicy.RETAIN,cors:[{allowedMethods:[s3.HttpMethods.PUT],allowedOrigins:[siteUrl],allowedHeaders:['content-type'],maxAge:3600}],lifecycleRules:[{prefix:'pending/',expiration:Duration.days(1),noncurrentVersionExpiration:Duration.days(1)},{abortIncompleteMultipartUploadAfter:Duration.days(1)}]});
    const api=new lambda.Function(this,'Api',{runtime:lambda.Runtime.NODEJS_22_X,handler:'index.handler',code:lambda.Code.fromAsset(path.join(root,'lambda/api')),timeout:Duration.seconds(20),memorySize:512,reservedConcurrentExecutions:10,environment:{SITE_URL:siteUrl,ROOT_DOMAIN:'dliu.com',TABLE_NAME:table.tableName,FILES_BUCKET:media.bucketName,PARAMETER_PREFIX:'/hujia'},logGroup:new logs.LogGroup(this,'ApiLogs',{retention:logs.RetentionDays.ONE_MONTH,removalPolicy:RemovalPolicy.DESTROY})});
    table.grantReadWriteData(api);media.grantReadWrite(api);
    api.addToRolePolicy(new iam.PolicyStatement({actions:['ssm:GetParameters'],resources:[this.formatArn({service:'ssm',resource:'parameter',resourceName:'hujia/*'})]}));
    api.addToRolePolicy(new iam.PolicyStatement({actions:['kms:Decrypt'],resources:['*'],conditions:{StringEquals:{'kms:ViaService':`ssm.${this.region}.amazonaws.com`}}}));
    const url=api.addFunctionUrl({authType:lambda.FunctionUrlAuthType.AWS_IAM});
    const site=new s3.Bucket(this,'Site',{blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,encryption:s3.BucketEncryption.S3_MANAGED,enforceSSL:true,removalPolicy:RemovalPolicy.RETAIN});
    const certificate=new acm.DnsValidatedCertificate(this,'Certificate',{domainName:domain,hostedZone:zone,region:'us-east-1'});
    const headers=new cf.ResponseHeadersPolicy(this,'Headers',{securityHeadersBehavior:{contentSecurityPolicy:{contentSecurityPolicy:`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://files.dliu.com https://${media.bucketName}.s3.${this.region}.amazonaws.com; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`,override:false},contentTypeOptions:{override:true},frameOptions:{frameOption:cf.HeadersFrameOption.DENY,override:true},referrerPolicy:{referrerPolicy:cf.HeadersReferrerPolicy.NO_REFERRER,override:true},strictTransportSecurity:{accessControlMaxAge:Duration.days(365),includeSubdomains:false,override:true}},customHeadersBehavior:{customHeaders:[{header:'X-Robots-Tag',value:'noindex, nofollow',override:true},{header:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=(), usb=()',override:true}]}});
    const rewrite=new cf.Function(this,'Route',{runtime:cf.FunctionRuntime.JS_2_0,code:cf.FunctionCode.fromInline(`function handler(event){var r=event.request;if(r.uri==='/old-website')r.uri='/api/old-website';if(r.uri==='/'||r.uri==='/about'||r.uri==='/security')r.uri='/index.html';return r;}`)});
    const functions=[{eventType:cf.FunctionEventType.VIEWER_REQUEST,function:rewrite}];
    // Traffic monitoring (dliu-com/traffic-monitor): visitor ID and city header. Do not log authentication cookies.
    const visitorId=cf.Function.fromFunctionAttributes(this,'VisitorId',{functionArn:Fn.importValue('TrafficVisitorFunctionArn'),functionName:'dliu-visitor-id'});
    const trafficGeo=cf.OriginRequestPolicy.fromOriginRequestPolicyId(this,'TrafficGeo',Fn.importValue('TrafficGeoOriginRequestPolicyId'));
    const siteFunctions=[...functions,{eventType:cf.FunctionEventType.VIEWER_RESPONSE,function:visitorId}];
    const apiBehavior:cf.BehaviorOptions={origin:origins.FunctionUrlOrigin.withOriginAccessControl(url),viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,allowedMethods:cf.AllowedMethods.ALLOW_ALL,cachePolicy:cf.CachePolicy.CACHING_DISABLED,originRequestPolicy:cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,responseHeadersPolicy:headers,functionAssociations:siteFunctions};
    const distribution=new cf.Distribution(this,'Distribution',{comment:'jh.dliu.com private memories',domainNames:[domain],certificate,defaultRootObject:'index.html',minimumProtocolVersion:cf.SecurityPolicyProtocol.TLS_V1_2_2021,priceClass:cf.PriceClass.PRICE_CLASS_100,defaultBehavior:{origin:origins.S3BucketOrigin.withOriginAccessControl(site),viewerProtocolPolicy:cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,cachePolicy:cf.CachePolicy.CACHING_OPTIMIZED,originRequestPolicy:trafficGeo,responseHeadersPolicy:headers,functionAssociations:siteFunctions},additionalBehaviors:{'old-website':apiBehavior,'api/*':apiBehavior,'auth/*':apiBehavior}});
    (distribution.node.defaultChild as cf.CfnDistribution).addPropertyOverride('DistributionConfig.Logging',{IncludeCookies:false});
    api.addPermission('CloudFrontInvoke',{principal:new iam.ServicePrincipal('cloudfront.amazonaws.com'),action:'lambda:InvokeFunction',sourceArn:distribution.distributionArn,invokedViaFunctionUrl:true});
    new deploy.BucketDeployment(this,'PublicCode',{sources:[deploy.Source.asset(path.join(root,'web'))],destinationBucket:site,distribution,distributionPaths:['/*'],cacheControl:[deploy.CacheControl.noCache()]});
    new route53.ARecord(this,'MainA',{zone,recordName:'jh',target:route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))});
    new route53.AaaaRecord(this,'MainAAAA',{zone,recordName:'jh',target:route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution))});
    new CfnOutput(this,'SiteUrl',{value:siteUrl});new CfnOutput(this,'FilesBucketName',{value:media.bucketName});new CfnOutput(this,'ApiFunctionName',{value:api.functionName});new CfnOutput(this,'TableName',{value:table.tableName});new CfnOutput(this,'DistributionId',{value:distribution.distributionId});
  }
}
