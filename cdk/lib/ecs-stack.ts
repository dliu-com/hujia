import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import { IHostedZone } from '@aws-cdk/aws-route53';

export interface EcsStackProps extends cdk.NestedStackProps {
    vpc: ec2.IVpc;
    subnets: ec2.ISubnet[];
    albSecurityGroup: ec2.ISecurityGroup;
    albListener: elb.IApplicationListener;
    appId: number;
    dnsName: string;
    hostedZone: IHostedZone;
}

export class EcsStack extends cdk.NestedStack {
    public fargateService: ecs.FargateService;
    constructor(scope: cdk.Construct, id: string, props: EcsStackProps) {
        super(scope, id, props);

        const cluster = new ecs.Cluster(this, 'Cluster', { vpc: props.vpc, });

        const taskDefinition = new ecs.TaskDefinition(this, 'TaskDefinition', {
            compatibility: ecs.Compatibility.FARGATE,
            cpu: '256',
            memoryMiB: '512',
        });

        taskDefinition.addContainer('hujia-container', {
            image: ecs.ContainerImage.fromRegistry('deweiliu/hujia'),
            portMappings: [{ containerPort: 80 }],
        });

        const securityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', { vpc: props.vpc, });

        securityGroup.connections.allowFrom(props.albSecurityGroup, ec2.Port.tcp(80), 'Allow traffic from ELB');
        securityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

        this.fargateService = new ecs.FargateService(this, 'Service', {
            cluster,
            taskDefinition,
            assignPublicIp: true,
            vpcSubnets: { subnets: props.subnets },
            securityGroups: [securityGroup],
            desiredCount: 1,
        });

        const albTargetGroup = new elb.ApplicationTargetGroup(this, 'TargetGroup', {
            port: 80,
            protocol: elb.ApplicationProtocol.HTTP,
            healthCheck: { enabled: true },
            vpc: props.vpc,
            targetType: elb.TargetType.IP,
            targets: [this.fargateService],
        });

        new elb.ApplicationListenerRule(this, "ListenerRule", {
            listener: props.albListener,
            priority: props.appId * 10,
            targetGroups: [albTargetGroup],
            conditions: [elb.ListenerCondition.hostHeaders([props.dnsName])],
        });

        const certificate = new acm.Certificate(this, 'DefaultCertificate', {
            domainName: props.dnsName,
            validation: acm.CertificateValidation.fromDns(props.hostedZone),
        });

        props.albListener.addCertificates('HujiaCertificate', [certificate]);
    }
}

