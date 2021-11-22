import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { PublicSubnet, Subnet } from '@aws-cdk/aws-ec2';
import { Fn } from '@aws-cdk/core';

export interface SubnetsStackProps extends cdk.NestedStackProps {
    vpc: ec2.IVpc;
    maxAzs: number;
    appId: number;
    igwId: string;

}
export class SubnetsStack extends cdk.NestedStack {
    public vpc: ec2.Vpc;
    public subnets: Subnet[] = [];
    constructor(scope: cdk.Construct, id: string, props: SubnetsStackProps) {
        super(scope, id, props);

        [...Array(props.maxAzs).keys()].forEach(azIndex => {
            const subnet = new PublicSubnet(this, `Subnet` + azIndex, {
                vpcId: props.vpc.vpcId,
                availabilityZone: Fn.select(azIndex, props.vpc.availabilityZones),
                cidrBlock: `10.0.${props.appId}.${azIndex * 16}/28`,
                mapPublicIpOnLaunch: true,
            });
            new ec2.CfnRoute(this, 'PublicRouting' + azIndex, {
                destinationCidrBlock: '0.0.0.0/0',
                routeTableId: subnet.routeTable.routeTableId,
                gatewayId: props.igwId,
            });

            this.subnets.push(subnet);
        });

    }
}