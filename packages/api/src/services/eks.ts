import {
  CreateFargateProfileCommand,
  CreateNodegroupCommand,
  DeleteFargateProfileCommand,
  DeleteNodegroupCommand,
  DescribeClusterCommand,
  DescribeFargateProfileCommand,
  DescribeNodegroupCommand,
  EKSClient,
  ListClustersCommand,
  ListFargateProfilesCommand,
  ListNodegroupsCommand,
  type Cluster,
  type FargateProfile,
  type FargateProfileSelector,
  type Nodegroup,
} from "@aws-sdk/client-eks";
import { awsClients } from "../aws";

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

export type EksFargateProfile = {
  name: string;
  arn?: string;
  clusterName: string;
  createdAt?: string;
  status?: string;
  podExecutionRoleArn?: string;
  subnets: string[];
  selectors: {
    namespace?: string;
    labels: Record<string, string>;
  }[];
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

function toEksVpcConfig(
  config: Cluster["resourcesVpcConfig"],
): EksVpcConfig | undefined {
  if (!config) return undefined;

  return {
    subnetIds: config.subnetIds ?? [],
    securityGroupIds: config.securityGroupIds ?? [],
    clusterSecurityGroupId: config.clusterSecurityGroupId,
    vpcId: config.vpcId,
    endpointPublicAccess: config.endpointPublicAccess,
    endpointPrivateAccess: config.endpointPrivateAccess,
    publicAccessCidrs: config.publicAccessCidrs ?? [],
  };
}

function toEksCluster(cluster: Cluster, nodegroupCount?: number): EksCluster {
  return {
    name: cluster.name ?? "",
    arn: cluster.arn,
    createdAt: cluster.createdAt?.toISOString(),
    version: cluster.version,
    endpoint: cluster.endpoint,
    roleArn: cluster.roleArn,
    status: cluster.status,
    platformVersion: cluster.platformVersion,
    certificateAuthority: cluster.certificateAuthority
      ? { data: cluster.certificateAuthority.data }
      : undefined,
    resourcesVpcConfig: toEksVpcConfig(cluster.resourcesVpcConfig),
    tags: cluster.tags ?? {},
    nodegroupCount,
  };
}

function toEksNodegroup(nodegroup: Nodegroup): EksNodegroup {
  return {
    name: nodegroup.nodegroupName ?? "",
    arn: nodegroup.nodegroupArn,
    clusterName: nodegroup.clusterName ?? "",
    version: nodegroup.version,
    releaseVersion: nodegroup.releaseVersion,
    createdAt: nodegroup.createdAt?.toISOString(),
    modifiedAt: nodegroup.modifiedAt?.toISOString(),
    status: nodegroup.status,
    capacityType: nodegroup.capacityType,
    instanceTypes: nodegroup.instanceTypes ?? [],
    subnets: nodegroup.subnets ?? [],
    nodeRole: nodegroup.nodeRole,
    scalingConfig: nodegroup.scalingConfig
      ? {
          minSize: nodegroup.scalingConfig.minSize,
          maxSize: nodegroup.scalingConfig.maxSize,
          desiredSize: nodegroup.scalingConfig.desiredSize,
        }
      : undefined,
    labels: nodegroup.labels ?? {},
    tags: nodegroup.tags ?? {},
  };
}

function toEksFargateProfile(profile: FargateProfile): EksFargateProfile {
  return {
    name: profile.fargateProfileName ?? "",
    arn: profile.fargateProfileArn,
    clusterName: profile.clusterName ?? "",
    createdAt: profile.createdAt?.toISOString(),
    status: profile.status,
    podExecutionRoleArn: profile.podExecutionRoleArn,
    subnets: profile.subnets ?? [],
    selectors: (profile.selectors ?? []).map(toEksFargateProfileSelector),
    tags: profile.tags ?? {},
  };
}

function toEksFargateProfileSelector(selector: FargateProfileSelector) {
  return {
    namespace: selector.namespace,
    labels: selector.labels ?? {},
  };
}

function getHttpStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const metadata = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata;
  return metadata?.httpStatusCode;
}

export function createEksService(client: EKSClient = awsClients.eks) {
  async function listClusterNames(): Promise<string[]> {
    const clusters: string[] = [];
    let nextToken: string | undefined;

    do {
      const res = await client.send(new ListClustersCommand({ nextToken }));
      clusters.push(...(res.clusters ?? []));
      nextToken = res.nextToken;
    } while (nextToken);

    return clusters;
  }

  async function listNodegroupNames(clusterName: string): Promise<string[]> {
    const nodegroups: string[] = [];
    let nextToken: string | undefined;

    try {
      do {
        const res = await client.send(
          new ListNodegroupsCommand({ clusterName, nextToken }),
        );
        nodegroups.push(...(res.nodegroups ?? []));
        nextToken = res.nextToken;
      } while (nextToken);
    } catch (error) {
      if (getHttpStatus(error) === 404) return [];
      throw error;
    }

    return nodegroups;
  }

  async function listFargateProfileNames(clusterName: string): Promise<string[]> {
    const profiles: string[] = [];
    let nextToken: string | undefined;

    try {
      do {
        const res = await client.send(
          new ListFargateProfilesCommand({ clusterName, nextToken }),
        );
        profiles.push(...(res.fargateProfileNames ?? []));
        nextToken = res.nextToken;
      } while (nextToken);
    } catch (error) {
      if (getHttpStatus(error) === 404) return [];
      throw error;
    }

    return profiles;
  }

  return {
    async listClusters(): Promise<EksCluster[]> {
      const names = await listClusterNames();

      return Promise.all(
        names.map(async (name) => {
          const [cluster, nodegroups, fargateProfiles] = await Promise.all([
            this.describeCluster(name),
            listNodegroupNames(name),
            listFargateProfileNames(name),
          ]);

          return {
            ...cluster,
            nodegroupCount: nodegroups.length,
            fargateProfileCount: fargateProfiles.length,
          };
        }),
      );
    },

    async describeCluster(name: string): Promise<EksCluster> {
      const res = await client.send(new DescribeClusterCommand({ name }));
      return toEksCluster(res.cluster ?? {});
    },

    async listNodegroups(clusterName: string): Promise<EksNodegroup[]> {
      const names = await listNodegroupNames(clusterName);

      return Promise.all(
        names.map((nodegroupName) =>
          this.describeNodegroup(clusterName, nodegroupName),
        ),
      );
    },

    async describeNodegroup(
      clusterName: string,
      nodegroupName: string,
    ): Promise<EksNodegroup> {
      const res = await client.send(
        new DescribeNodegroupCommand({ clusterName, nodegroupName }),
      );
      return toEksNodegroup(res.nodegroup ?? {});
    },

    async createNodegroup(
      clusterName: string,
      input: CreateEksNodegroupInput,
    ): Promise<EksNodegroup> {
      const res = await client.send(
        new CreateNodegroupCommand({
          clusterName,
          nodegroupName: input.name,
          nodeRole: input.nodeRole,
          subnets: input.subnets,
          instanceTypes: input.instanceTypes,
          scalingConfig: input.scalingConfig,
          labels: input.labels,
          tags: input.tags,
        }),
      );
      return toEksNodegroup(res.nodegroup ?? {});
    },

    async deleteNodegroup(
      clusterName: string,
      nodegroupName: string,
    ): Promise<EksNodegroup> {
      const res = await client.send(
        new DeleteNodegroupCommand({ clusterName, nodegroupName }),
      );
      return toEksNodegroup(res.nodegroup ?? {});
    },

    async listFargateProfiles(clusterName: string): Promise<EksFargateProfile[]> {
      const names = await listFargateProfileNames(clusterName);

      return Promise.all(
        names.map((profileName) =>
          this.describeFargateProfile(clusterName, profileName),
        ),
      );
    },

    async describeFargateProfile(
      clusterName: string,
      profileName: string,
    ): Promise<EksFargateProfile> {
      const res = await client.send(
        new DescribeFargateProfileCommand({
          clusterName,
          fargateProfileName: profileName,
        }),
      );
      return toEksFargateProfile(res.fargateProfile ?? {});
    },

    async createFargateProfile(
      clusterName: string,
      input: CreateEksFargateProfileInput,
    ): Promise<EksFargateProfile> {
      const res = await client.send(
        new CreateFargateProfileCommand({
          clusterName,
          fargateProfileName: input.name,
          podExecutionRoleArn: input.podExecutionRoleArn,
          subnets: input.subnets,
          selectors: input.selectors.map((selector) => ({
            namespace: selector.namespace,
            labels: selector.labels,
          })),
          tags: input.tags,
        }),
      );
      return toEksFargateProfile(res.fargateProfile ?? {});
    },

    async deleteFargateProfile(
      clusterName: string,
      profileName: string,
    ): Promise<EksFargateProfile> {
      const res = await client.send(
        new DeleteFargateProfileCommand({
          clusterName,
          fargateProfileName: profileName,
        }),
      );
      return toEksFargateProfile(res.fargateProfile ?? {});
    },
  };
}

export const eksService = createEksService();
