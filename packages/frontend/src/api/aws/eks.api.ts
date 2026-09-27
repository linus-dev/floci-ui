import { apiClient, apiEndpointKeys } from "@/api/api";
import type { ResourceSummary } from "@/api/types";

export type EksVpcConfig = {
  subnetIds: string[];
  securityGroupIds: string[];
  clusterSecurityGroupId?: string;
  vpcId?: string;
  endpointPublicAccess?: boolean;
  endpointPrivateAccess?: boolean;
  publicAccessCidrs: string[];
};

export type EksCluster = {
  name: string;
  arn?: string;
  createdAt?: string;
  version?: string;
  endpoint?: string;
  roleArn?: string;
  status?: string;
  platformVersion?: string;
  certificateAuthority?: {
    data?: string;
  };
  resourcesVpcConfig?: EksVpcConfig;
  tags: Record<string, string>;
  nodegroupCount?: number;
  fargateProfileCount?: number;
};

export type EksNodegroup = {
  name: string;
  arn?: string;
  clusterName: string;
  version?: string;
  releaseVersion?: string;
  createdAt?: string;
  modifiedAt?: string;
  status?: string;
  capacityType?: string;
  instanceTypes: string[];
  subnets: string[];
  nodeRole?: string;
  scalingConfig?: {
    minSize?: number;
    maxSize?: number;
    desiredSize?: number;
  };
  labels: Record<string, string>;
  tags: Record<string, string>;
};

export type EksFargateProfileSelector = {
  namespace?: string;
  labels: Record<string, string>;
};

export type EksFargateProfile = {
  name: string;
  arn?: string;
  clusterName: string;
  createdAt?: string;
  status?: string;
  podExecutionRoleArn?: string;
  subnets: string[];
  selectors: EksFargateProfileSelector[];
  tags: Record<string, string>;
};

export type CreateEksNodegroupInput = {
  name: string;
  nodeRole: string;
  subnets: string[];
  instanceTypes?: string[];
  scalingConfig?: {
    minSize?: number;
    maxSize?: number;
    desiredSize?: number;
  };
  labels?: Record<string, string>;
  tags?: Record<string, string>;
};

export type CreateEksFargateProfileInput = {
  name: string;
  podExecutionRoleArn: string;
  subnets?: string[];
  selectors: {
    namespace?: string;
    labels?: Record<string, string>;
  }[];
  tags?: Record<string, string>;
};

export async function listEksClusters(
  signal?: AbortSignal,
): Promise<EksCluster[]> {
  const res = await apiClient.call<EksCluster[]>(
    apiEndpointKeys.aws.eks.clusters.list,
    { signal },
  );

  return res.data;
}

export async function describeEksCluster(
  name: string,
  signal?: AbortSignal,
): Promise<EksCluster> {
  const res = await apiClient.call<EksCluster>(
    apiEndpointKeys.aws.eks.clusters.describe,
    { signal },
    { name },
  );

  return res.data;
}

export async function listEksNodegroups(
  clusterName: string,
  signal?: AbortSignal,
): Promise<EksNodegroup[]> {
  const res = await apiClient.call<EksNodegroup[]>(
    apiEndpointKeys.aws.eks.nodegroups.list,
    { signal },
    { name: clusterName },
  );

  return res.data;
}

export async function describeEksNodegroup(
  clusterName: string,
  nodegroupName: string,
  signal?: AbortSignal,
): Promise<EksNodegroup> {
  const res = await apiClient.call<EksNodegroup>(
    apiEndpointKeys.aws.eks.nodegroups.describe,
    { signal },
    { name: clusterName, nodegroup: nodegroupName },
  );

  return res.data;
}

export async function createEksNodegroup(
  clusterName: string,
  input: CreateEksNodegroupInput,
): Promise<EksNodegroup> {
  const res = await apiClient.call<EksNodegroup, CreateEksNodegroupInput>(
    apiEndpointKeys.aws.eks.nodegroups.create,
    { body: input },
    { name: clusterName },
  );

  return res.data;
}

export async function deleteEksNodegroup(
  clusterName: string,
  nodegroupName: string,
): Promise<EksNodegroup> {
  const res = await apiClient.call<EksNodegroup>(
    apiEndpointKeys.aws.eks.nodegroups.delete,
    {},
    { name: clusterName, nodegroup: nodegroupName },
  );

  return res.data;
}

export async function listEksFargateProfiles(
  clusterName: string,
  signal?: AbortSignal,
): Promise<EksFargateProfile[]> {
  const res = await apiClient.call<EksFargateProfile[]>(
    apiEndpointKeys.aws.eks.fargateProfiles.list,
    { signal },
    { name: clusterName },
  );

  return res.data;
}

export async function describeEksFargateProfile(
  clusterName: string,
  profileName: string,
  signal?: AbortSignal,
): Promise<EksFargateProfile> {
  const res = await apiClient.call<EksFargateProfile>(
    apiEndpointKeys.aws.eks.fargateProfiles.describe,
    { signal },
    { name: clusterName, profile: profileName },
  );

  return res.data;
}

export async function createEksFargateProfile(
  clusterName: string,
  input: CreateEksFargateProfileInput,
): Promise<EksFargateProfile> {
  const res = await apiClient.call<
    EksFargateProfile,
    CreateEksFargateProfileInput
  >(
    apiEndpointKeys.aws.eks.fargateProfiles.create,
    { body: input },
    { name: clusterName },
  );

  return res.data;
}

export async function deleteEksFargateProfile(
  clusterName: string,
  profileName: string,
): Promise<EksFargateProfile> {
  const res = await apiClient.call<EksFargateProfile>(
    apiEndpointKeys.aws.eks.fargateProfiles.delete,
    {},
    { name: clusterName, profile: profileName },
  );

  return res.data;
}

export async function listEksResources(
  signal?: AbortSignal,
): Promise<ResourceSummary[]> {
  const clusters = await listEksClusters(signal);

  return clusters.map((cluster) => ({
    id: cluster.arn ?? cluster.name,
    name: cluster.name,
    status: cluster.status,
    metadata: {
      version: cluster.version,
      platformVersion: cluster.platformVersion,
      nodegroups: cluster.nodegroupCount ?? 0,
      fargateProfiles: cluster.fargateProfileCount ?? 0,
      vpcId: cluster.resourcesVpcConfig?.vpcId,
    },
  }));
}

export const eksClient = {
  listClusters: listEksClusters,
  describeCluster: describeEksCluster,
  listNodegroups: listEksNodegroups,
  describeNodegroup: describeEksNodegroup,
  createNodegroup: createEksNodegroup,
  deleteNodegroup: deleteEksNodegroup,
  listFargateProfiles: listEksFargateProfiles,
  describeFargateProfile: describeEksFargateProfile,
  createFargateProfile: createEksFargateProfile,
  deleteFargateProfile: deleteEksFargateProfile,
  listResources: listEksResources,
};
