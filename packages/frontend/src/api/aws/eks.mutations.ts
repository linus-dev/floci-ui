import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  eksClient,
  type CreateEksFargateProfileInput,
  type CreateEksNodegroupInput,
} from "./eks.api";
import { eksQueryKeys } from "./eks.queries";

export type CreateEksNodegroupMutationInput = {
  clusterName: string;
  nodegroup: CreateEksNodegroupInput;
};

export type DeleteEksNodegroupMutationInput = {
  clusterName: string;
  nodegroupName: string;
};

export type CreateEksFargateProfileMutationInput = {
  clusterName: string;
  profile: CreateEksFargateProfileInput;
};

export type DeleteEksFargateProfileMutationInput = {
  clusterName: string;
  profileName: string;
};

export function useCreateEksNodegroupMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ clusterName, nodegroup }: CreateEksNodegroupMutationInput) =>
      eksClient.createNodegroup(clusterName, nodegroup),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({
        queryKey: eksQueryKeys.nodegroups(input.clusterName),
      });
      void qc.invalidateQueries({ queryKey: eksQueryKeys.clusters });
    },
  });
}

export function useDeleteEksNodegroupMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ clusterName, nodegroupName }: DeleteEksNodegroupMutationInput) =>
      eksClient.deleteNodegroup(clusterName, nodegroupName),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({
        queryKey: eksQueryKeys.nodegroups(input.clusterName),
      });
      void qc.invalidateQueries({ queryKey: eksQueryKeys.clusters });
    },
  });
}

export function useCreateEksFargateProfileMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ clusterName, profile }: CreateEksFargateProfileMutationInput) =>
      eksClient.createFargateProfile(clusterName, profile),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({
        queryKey: eksQueryKeys.fargateProfiles(input.clusterName),
      });
      void qc.invalidateQueries({ queryKey: eksQueryKeys.clusters });
    },
  });
}

export function useDeleteEksFargateProfileMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ clusterName, profileName }: DeleteEksFargateProfileMutationInput) =>
      eksClient.deleteFargateProfile(clusterName, profileName),
    onSuccess: (_, input) => {
      void qc.invalidateQueries({
        queryKey: eksQueryKeys.fargateProfiles(input.clusterName),
      });
      void qc.invalidateQueries({ queryKey: eksQueryKeys.clusters });
    },
  });
}
