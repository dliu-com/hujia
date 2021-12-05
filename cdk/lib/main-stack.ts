import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import { SubnetsStack } from './subnets-stack';
import { EcsStack } from './ecs-stack';
import { Duration, Tags } from '@aws-cdk/core';
import { ImportValues } from './import-values';

export interface CdkStackProps {
  maxAzs: number;
  appId: number;
  dnsRecord: string;
  domain: string;
  appName: string;
}
export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: CdkStackProps) {
    super(scope, id);
    Tags.of(this).add('service', props.dnsRecord);

    const get = new ImportValues(this, props);

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDefinition', { networkMode: ecs.NetworkMode.AWS_VPC });

    taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromRegistry(get.dockerImage),
      containerName: `${get.appName}-container`,
      memoryReservationMiB: 256,
      portMappings: [{ containerPort: 80, hostPort: 80, protocol: ecs.Protocol.TCP }],
      logging: new ecs.AwsLogDriver({ streamPrefix: get.appName }),
    });

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', { vpc: get.vpc });
    securityGroup.connections.allowFrom(get.albSecurityGroup, ec2.Port.tcp(80), 'Allow traffic from ELB');

    const subnets: ec2.ISubnet[] = [];

    [...Array(get.maxAzs).keys()].forEach(azIndex => {
      const subnet = new ec2.PublicSubnet(this, `Subnet${azIndex}`, {
        vpcId: get.vpc.vpcId,
        availabilityZone: cdk.Stack.of(this).availabilityZones[azIndex],
        cidrBlock: `10.0.${get.appId}.${azIndex * 16}/28`,
        mapPublicIpOnLaunch: true,
      });
      subnets.push(subnet);

      subnet.addRoute(`PublicRouting${azIndex}`, {
        routerId: get.igwId,
        routerType: ec2.RouterType.GATEWAY,
        destinationCidrBlock: '0.0.0.0/0',
      })
    });

    const service = new ecs.Ec2Service(this, 'Service', {
      cluster:get.cluster,
      taskDefinition,
      securityGroups: [securityGroup],
      vpcSubnets: { subnets },
    });

  }
}
