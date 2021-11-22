import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import { SubnetsStack } from './subnets-stack';
import { EcsStack } from './ecs-stack';
import { Duration } from '@aws-cdk/core';

export interface CdkStackProps extends cdk.StackProps {
  maxAzs: number;
  appId: number;
  dnsRecord: string;
  domain: string;
}
export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: CdkStackProps) {
    super(scope, id, props);
    const { hostedZone, igwId, vpc, alb, albSecurityGroup, albListener } = this.importValues(props);

    const vpcStack = new SubnetsStack(this, 'SubnetsStack', { vpc: vpc, maxAzs: props.maxAzs, appId: props.appId, igwId });

    const ecs = new EcsStack(this, 'ECS', {
      subnets: vpcStack.subnets,
      albSecurityGroup,
      albListener,
      vpc: vpc,
      appId: props.appId,
      dnsName: `${props.dnsRecord}.${props.domain}`,
      hostedZone,
    });

    const record = new route53.CnameRecord(this, "AliasRecord", {
      zone: hostedZone,
      domainName: alb.loadBalancerDnsName,
      recordName: props.dnsRecord,
      ttl: Duration.hours(1),
    });

    new cdk.CfnOutput(this, 'DnsName', { value: record.domainName });
  }

  importValues(props: CdkStackProps) {
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: cdk.Fn.importValue('DLIUCOMHostedZoneID'),
      zoneName: props.domain,
    });

    const igwId = cdk.Fn.importValue('Core-InternetGateway');

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ALBVPC', {
      vpcId: cdk.Fn.importValue('Core-Vpc'),
      availabilityZones: cdk.Stack.of(this).availabilityZones,
    });

    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, "ALBSecurityGroup",
      cdk.Fn.importValue('Core-AlbSecurityGroup')
    );
    const albListener = elb.ApplicationListener.fromApplicationListenerAttributes(this, "ELBListener", {
      listenerArn: cdk.Fn.importValue('Core-AlbListener'),
      securityGroup: albSecurityGroup,
    });

    const alb = elb.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'ALB', {
      loadBalancerArn: cdk.Fn.importValue('Core-Alb'),
      securityGroupId: albSecurityGroup.securityGroupId,
      loadBalancerCanonicalHostedZoneId: cdk.Fn.importValue('Core-AlbCanonicalHostedZone'),
      loadBalancerDnsName: cdk.Fn.importValue('Core-AlbDns'),
    });

    return { hostedZone, igwId, vpc, alb, albSecurityGroup, albListener };
  }
}
