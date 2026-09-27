import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  allocateEc2ElasticIp,
  associateEc2ElasticIp,
  associateEc2RouteTable,
  attachEc2InternetGateway,
  authorizeEc2SecurityGroupEgress,
  authorizeEc2SecurityGroupIngress,
  createEc2Ami,
  createEc2InternetGateway,
  createEc2KeyPair,
  createEc2NatGateway,
  createEc2Route,
  createEc2RouteTable,
  createEc2SecurityGroup,
  createEc2Subnet,
  createEc2Vpc,
  deregisterEc2Ami,
  deleteEc2InternetGateway,
  deleteEc2KeyPair,
  deleteEc2NatGateway,
  deleteEc2Route,
  deleteEc2RouteTable,
  deleteEc2SecurityGroup,
  deleteEc2Subnet,
  deleteEc2Vpc,
  detachEc2InternetGateway,
  disassociateEc2ElasticIp,
  disassociateEc2RouteTable,
  modifyEc2SubnetAttribute,
  modifyEc2VpcAttribute,
  rebootEc2Instance,
  releaseEc2ElasticIp,
  revokeEc2SecurityGroupEgress,
  revokeEc2SecurityGroupIngress,
  runEc2Instance,
  startEc2Instance,
  stopEc2Instance,
  terminateEc2Instance,
  updateEc2InstanceTags,
} from "./ec2.api";
import type {
  CreateAmiInput,
  CreateNatGatewayInput,
  CreateRouteInput,
  Ec2Tag,
  IpPermissionInput,
  RunEc2InstanceInput,
} from "./ec2.api";
import { ec2QueryKeys } from "./ec2.queries";

// ─── Instance lifecycle ───────────────────────────────────────────────────────

export function useCreateEc2InstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RunEc2InstanceInput) => runEc2Instance(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
    },
  });
}

export function useStartEc2InstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => startEc2Instance(instanceId),
    onSuccess: (_data, instanceId) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(instanceId) });
    },
  });
}

export function useStopEc2InstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => stopEc2Instance(instanceId),
    onSuccess: (_data, instanceId) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(instanceId) });
    },
  });
}

export function useRebootEc2InstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => rebootEc2Instance(instanceId),
    onSuccess: (_data, instanceId) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(instanceId) });
    },
  });
}

export function useTerminateEc2InstanceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceId: string) => terminateEc2Instance(instanceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
    },
  });
}

export function useUpdateEc2InstanceTagsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, toAdd, toRemove }: { instanceId: string; toAdd: Ec2Tag[]; toRemove: string[] }) =>
      updateEc2InstanceTags(instanceId, toAdd, toRemove),
    onSuccess: (_data, { instanceId }) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instance(instanceId) });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
    },
  });
}

// ─── AMIs ─────────────────────────────────────────────────────────────────────

export function useCreateAmiMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, input }: { instanceId: string; input: CreateAmiInput }) =>
      createEc2Ami(instanceId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.amis });
    },
  });
}

export function useDeregisterAmiMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => deregisterEc2Ami(imageId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.amis });
    },
  });
}

// ─── Key pairs ────────────────────────────────────────────────────────────────

export function useCreateKeyPairMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createEc2KeyPair(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.keyPairs });
    },
  });
}

export function useDeleteKeyPairMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteEc2KeyPair(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.keyPairs });
    },
  });
}

// ─── Security groups ──────────────────────────────────────────────────────────

export function useCreateSecurityGroupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description, vpcId }: { name: string; description: string; vpcId: string }) =>
      createEc2SecurityGroup(name, description, vpcId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
    },
  });
}

export function useDeleteSecurityGroupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteEc2SecurityGroup(groupId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
    },
  });
}

export function useAuthorizeSecurityGroupIngressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, permission }: { groupId: string; permission: IpPermissionInput }) =>
      authorizeEc2SecurityGroupIngress(groupId, permission),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
    },
  });
}

export function useRevokeSecurityGroupIngressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, permission }: { groupId: string; permission: IpPermissionInput }) =>
      revokeEc2SecurityGroupIngress(groupId, permission),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
    },
  });
}

export function useAuthorizeSecurityGroupEgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, permission }: { groupId: string; permission: IpPermissionInput }) =>
      authorizeEc2SecurityGroupEgress(groupId, permission),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
    },
  });
}

export function useRevokeSecurityGroupEgressMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, permission }: { groupId: string; permission: IpPermissionInput }) =>
      revokeEc2SecurityGroupEgress(groupId, permission),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
    },
  });
}

// ─── VPCs ─────────────────────────────────────────────────────────────────────

export function useCreateVpcMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cidrBlock: string) => createEc2Vpc(cidrBlock),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.vpcs });
    },
  });
}

export function useDeleteVpcMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vpcId: string) => deleteEc2Vpc(vpcId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.vpcs });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnetsAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.securityGroupsAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.internetGateways });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps });
    },
  });
}

// ─── Subnets ──────────────────────────────────────────────────────────────────

export function useCreateSubnetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      vpcId,
      cidrBlock,
      availabilityZone,
    }: {
      vpcId: string;
      cidrBlock: string;
      availabilityZone?: string;
    }) => createEc2Subnet(vpcId, cidrBlock, availabilityZone),
    onSuccess: (_data, { vpcId }) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnets(vpcId) });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnets() });
    },
  });
}

export function useDeleteSubnetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subnetId: string) => deleteEc2Subnet(subnetId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnetsAll });
    },
  });
}

// ─── Internet Gateways ────────────────────────────────────────────────────────

export function useCreateInternetGatewayMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createEc2InternetGateway(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.internetGateways });
    },
  });
}

export function useAttachInternetGatewayMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ igwId, vpcId }: { igwId: string; vpcId: string }) =>
      attachEc2InternetGateway(igwId, vpcId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.internetGateways });
    },
  });
}

export function useDetachInternetGatewayMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ igwId, vpcId }: { igwId: string; vpcId: string }) =>
      detachEc2InternetGateway(igwId, vpcId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.internetGateways });
    },
  });
}

export function useDeleteInternetGatewayMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (igwId: string) => deleteEc2InternetGateway(igwId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.internetGateways });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
    },
  });
}

// ─── NAT Gateways ─────────────────────────────────────────────────────────────

export function useCreateNatGatewayMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNatGatewayInput) => createEc2NatGateway(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.natGatewaysAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps });
    },
  });
}

export function useDeleteNatGatewayMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (natId: string) => deleteEc2NatGateway(natId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.natGatewaysAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
    },
  });
}

// ─── Route Tables ─────────────────────────────────────────────────────────────

export function useCreateRouteTableMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vpcId, name }: { vpcId: string; name?: string }) =>
      createEc2RouteTable(vpcId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
    },
  });
}

export function useDeleteRouteTableMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rtbId: string) => deleteEc2RouteTable(rtbId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnetsAll });
    },
  });
}

export function useCreateRouteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rtbId, input }: { rtbId: string; input: CreateRouteInput }) =>
      createEc2Route(rtbId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
    },
  });
}

export function useDeleteRouteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rtbId, cidr }: { rtbId: string; cidr: string }) =>
      deleteEc2Route(rtbId, cidr),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
    },
  });
}

export function useAssociateRouteTableMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rtbId, subnetId }: { rtbId: string; subnetId: string }) =>
      associateEc2RouteTable(rtbId, subnetId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnetsAll });
    },
  });
}

export function useDisassociateRouteTableMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (associationId: string) => disassociateEc2RouteTable(associationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.routeTablesAll });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnetsAll });
    },
  });
}

// ─── Elastic IPs ──────────────────────────────────────────────────────────────

export function useAllocateElasticIpMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => allocateEc2ElasticIp(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps });
    },
  });
}

export function useReleaseElasticIpMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (allocationId: string) => releaseEc2ElasticIp(allocationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps });
    },
  });
}

export function useAssociateElasticIpMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ allocationId, instanceId }: { allocationId: string; instanceId: string }) =>
      associateEc2ElasticIp(allocationId, instanceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
    },
  });
}

export function useDisassociateElasticIpMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ allocationId, associationId }: { allocationId: string; associationId: string }) =>
      disassociateEc2ElasticIp(allocationId, associationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.elasticIps });
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.instances });
    },
  });
}

export function useModifySubnetAttributeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subnetId, mapPublicIpOnLaunch }: { subnetId: string; mapPublicIpOnLaunch: boolean }) =>
      modifyEc2SubnetAttribute(subnetId, mapPublicIpOnLaunch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.subnetsAll });
    },
  });
}

export function useModifyVpcAttributeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vpcId, attribute, value }: { vpcId: string; attribute: "enableDnsHostnames" | "enableDnsSupport"; value: boolean }) =>
      modifyEc2VpcAttribute(vpcId, attribute, value),
    onSuccess: (_data, { vpcId }) => {
      void qc.invalidateQueries({ queryKey: ec2QueryKeys.vpcAttributes(vpcId) });
    },
  });
}
