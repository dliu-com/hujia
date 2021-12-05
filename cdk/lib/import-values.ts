
import * as cdk from '@aws-cdk/core';
import * as route53 from '@aws-cdk/aws-route53';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elb from '@aws-cdk/aws-elasticloadbalancingv2';
import { Fn } from '@aws-cdk/core';
import { IApplicationListener, IApplicationLoadBalancer } from '@aws-cdk/aws-elasticloadbalancingv2';
import { CdkStackProps } from './main-stack';
import { ICluster } from '@aws-cdk/aws-ecs';

export class ImportValues extends cdk.NestedStack implements CdkStackProps {
    public hostedZone: route53.IHostedZone;
    public igwId: string;
    public vpc: ec2.IVpc;
    public albSecurityGroup: ec2.ISecurityGroup;
    public albListener: IApplicationListener;
    public alb: IApplicationLoadBalancer;
    public cluster: ICluster;

    public maxAzs: number;
    public appId: number;
    public dnsRecord: string;
    public domain: string;
    public appName: string;
    public dockerImage: string;
    public priority: number;
    public dnsName:string;

    constructor(scope: cdk.Construct, props: CdkStackProps) {
        super(scope, 'ImportValues')

        this.maxAzs = props.maxAzs;
        this.appId = props.appId;
        this.dnsRecord = props.dnsRecord;
        this.domain = props.domain;
        this.appName = props.appName;
        this.dockerImage = `deweiliu/${this.appName}`;
        this.priority = this.appId * 10;
        this.dnsName=`${this.dnsRecord}.${this.domain}`;


        this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(scope, 'HostedZone', {
            hostedZoneId: Fn.importValue('DLIUCOMHostedZoneID'),
            zoneName: props.domain,
        });

        this.igwId = Fn.importValue('Core-InternetGateway');

        this.vpc = ec2.Vpc.fromVpcAttributes(scope, 'ALBVPC', {
            vpcId: Fn.importValue('Core-Vpc'),
            availabilityZones: cdk.Stack.of(this).availabilityZones,
        });

        this.albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(scope, "ALBSecurityGroup",
            Fn.importValue('Core-AlbSecurityGroup')
        );
        this.albListener = elb.ApplicationListener.fromApplicationListenerAttributes(scope, "ELBListener", {
            listenerArn: Fn.importValue('Core-AlbListener'),
            securityGroup: this.albSecurityGroup,
        });

        this.alb = elb.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(scope, 'ALB', {
            loadBalancerArn: Fn.importValue('Core-Alb'),
            securityGroupId: this.albSecurityGroup.securityGroupId,
            loadBalancerCanonicalHostedZoneId: Fn.importValue('Core-AlbCanonicalHostedZone'),
            loadBalancerDnsName: Fn.importValue('Core-AlbDns'),
        });

        this.cluster = ecs.Cluster.fromClusterAttributes(scope, 'Cluster', {
            clusterName: Fn.importValue('Core-ClusterName'),
            securityGroups: [ec2.SecurityGroup.fromSecurityGroupId(scope, 'a', Fn.importValue('Core-ClusterSecurityGroup'))],
            vpc: this.vpc,
        });
    }


}