import {CloudAdapterRegistry} from './registry/CloudAdapterRegistry'
import {AwsComputeAdapter} from './adapter-aws/AwsComputeAdapter'
import {AwsNetworkingAdapter} from './adapter-aws/AwsNetworkingAdapter'
import {AwsDatabaseAdapter} from './adapter-aws/AwsDatabaseAdapter'
import {AwsEksAdapter} from './adapter-aws/AwsEksAdapter'
import {AwsStorageAdapter} from './adapter-aws/AwsStorageAdapter'
import {AwsLogsAdapter} from './adapter-aws/AwsLogsAdapter'
import {AzureNoSqlAdapter} from './adapter-azure/AzureNoSqlAdapter'
import {AwsDynamoDbAdapter} from './adapter-aws/AwsDynamoDbAdapter'
import {AzureDatabaseAdapter} from './adapter-azure/AzureDatabaseAdapter'
import {AzureServiceBusAdapter} from './adapter-azure/AzureServiceBusAdapter'
import {AzureStorageAdapter} from './adapter-azure/AzureStorageAdapter'
import {AzureAksAdapter} from './adapter-azure/AzureAksAdapter'
import {AzureComputeAdapter} from './adapter-azure/AzureComputeAdapter'
import {GcpStorageAdapter} from './adapter-gcp/GcpStorageAdapter'
import {GcpCloudFunctionsAdapter} from './adapter-gcp/GcpCloudFunctionsAdapter'
import {GcpCloudSqlAdapter} from './adapter-gcp/GcpCloudSqlAdapter'
import {GcpGkeAdapter} from './adapter-gcp/GcpGkeAdapter'
import {GcpCloudRunAdapter} from './adapter-gcp/GcpCloudRunAdapter'
import {GcpPubSubAdapter} from './adapter-gcp/GcpPubSubAdapter'
import {GcpSecretManagerAdapter} from './adapter-gcp/GcpSecretManagerAdapter'
import {GcpSchedulerAdapter} from './adapter-gcp/GcpSchedulerAdapter'
import {AwsSqsAdapter} from './adapter-aws/AwsSqsAdapter'
import {CloudProxyService} from './service/CloudProxyService'
import {AzureServerlessAdapter} from './adapter-azure/AzureServerlessAdapter'
import {AzureKeyVaultAdapter} from './adapter-azure/AzureKeyVaultAdapter'
import {AzureAppConfigurationAdapter} from './adapter-azure/AzureAppConfigurationAdapter'
import {AwsServerlessAdapter} from './adapter-aws/AwsServerlessAdapter'
import {AwsParameterStoreAdapter} from './adapter-aws/AwsParameterStoreAdapter'
import {AwsKmsAdapter} from './adapter-aws/AwsKmsAdapter'
import {AwsStepFunctionsAdapter} from './adapter-aws/AwsStepFunctionsAdapter'
import {AwsLoadBalancingAdapter} from './adapter-aws/AwsLoadBalancingAdapter'
import {AwsEventBridgeAdapter} from './adapter-aws/AwsEventBridgeAdapter'
import {AwsIamAdapter} from './adapter-aws/AwsIamAdapter'
import {AwsApiGatewayAdapter} from './adapter-aws/AwsApiGatewayAdapter'
import {AwsCloudFormationAdapter} from './adapter-aws/AwsCloudFormationAdapter'
import {AwsSecretsAdapter} from './adapter-aws/AwsSecretsAdapter'
import {AwsSesAdapter} from './adapter-aws/AwsSesAdapter'
import {AwsAppConfigAdapter} from './adapter-aws/AwsAppConfigAdapter'
import {AwsKinesisAdapter} from './adapter-aws/AwsKinesisAdapter'
import {AwsSageMakerAdapter} from './adapter-aws/AwsSageMakerAdapter'
import {awsClientsForAccount, resolveAccountId} from './aws'
import {AzureRestRuntimeClient, azureAccountNameForSubscription, azureEndpoint, resolveAzureSubscriptionId} from './azure'
import {createEc2Service} from './services/ec2'
import {createEksService} from './services/eks'
import {createRdsService} from './services/rds'

/**
 * Build adapters for the selected AWS account and Azure subscription. AWS uses
 * account-specific SDK credentials; Azure uses the selected ARM subscription and
 * a distinct local data-plane namespace for each non-default subscription.
 *
 * Exported separately from the service so tests can assert registry contents —
 * notably that every adapter implements what its schema advertises — without
 * reaching into private state.
 */
export function createCloudAdapterRegistry(accountId?: string | null, azureSubscription?: string | null): CloudAdapterRegistry {
    const clients = awsClientsForAccount(accountId)
    const subscriptionId = resolveAzureSubscriptionId(azureSubscription)
    const azureClient = new AzureRestRuntimeClient(azureEndpoint(), azureAccountNameForSubscription(subscriptionId))
    const ec2Service = createEc2Service(clients.ec2)

    return new CloudAdapterRegistry([
        new AwsStorageAdapter(clients.s3),
        new AwsDynamoDbAdapter(clients.dynamodb),
        new AwsEksAdapter(createEksService(clients.eks)),
        new AwsDatabaseAdapter(createRdsService(clients.rds), clients.rds),
        new AwsComputeAdapter(ec2Service),
        new AwsNetworkingAdapter(ec2Service),
        new AwsServerlessAdapter(clients.lambda),
        new AwsLogsAdapter(clients.logs),
        new AwsParameterStoreAdapter(clients.ssm),
        new AwsKmsAdapter(clients.kms),
        new AwsStepFunctionsAdapter(clients.sfn),
        new AwsLoadBalancingAdapter(clients.elbv2),
        new AwsEventBridgeAdapter(clients.eventbridge),
        new AwsIamAdapter(clients.iam),
        new AwsApiGatewayAdapter(clients.apiGateway),
        new AwsCloudFormationAdapter(clients.cloudformation),
        new AwsSecretsAdapter(clients.secretsManager),
        new AwsSesAdapter(),
        new AwsAppConfigAdapter(clients.appConfig),
        new AwsKinesisAdapter(clients.kinesis),
        new AwsSageMakerAdapter(clients.sagemaker),
        new AzureStorageAdapter(azureClient),
        new AzureServiceBusAdapter(azureClient),
        AzureDatabaseAdapter.forSubscription(azureClient, subscriptionId),
        new AzureAksAdapter(azureClient, subscriptionId),
        new AzureNoSqlAdapter(azureClient),
        new AzureComputeAdapter(azureClient, subscriptionId),
        new GcpStorageAdapter(),
        new GcpCloudFunctionsAdapter(),
        new GcpCloudSqlAdapter(),
        new GcpGkeAdapter(),
        new GcpCloudRunAdapter(),
        new GcpPubSubAdapter(),
        new GcpSecretManagerAdapter(),
        new GcpSchedulerAdapter(),
        new AwsSqsAdapter(clients.sqs),
        new AzureServerlessAdapter(azureClient),
        new AzureKeyVaultAdapter(azureClient),
        new AzureAppConfigurationAdapter(azureClient),
    ])
}

export function createCloudProxyService(accountId?: string | null, azureSubscription?: string | null): CloudProxyService {
    return new CloudProxyService(createCloudAdapterRegistry(accountId, azureSubscription))
}

const serviceCache = new Map<string, CloudProxyService>()

/** Return a cached service for the selected cloud contexts. */
export function serviceForContext(accountId?: string | null, azureSubscription?: string | null): CloudProxyService {
    const id = resolveAccountId(accountId)
    const subscriptionId = resolveAzureSubscriptionId(azureSubscription)
    const key = `${id}:${subscriptionId}`
    let service = serviceCache.get(key)
    if (!service) {
        service = createCloudProxyService(id, subscriptionId)
        serviceCache.set(key, service)
    }
    return service
}
