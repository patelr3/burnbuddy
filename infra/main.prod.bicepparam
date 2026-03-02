/*
  Production parameter file for buddyburn infrastructure.
  Deploy to resource group: buddyburn-prod

  az deployment group create \
    --resource-group buddyburn-prod \
    --template-file infra/main.bicep \
    --parameters infra/main.prod.bicepparam

  Dry run:
    az deployment group create \
      --resource-group buddyburn-prod \
      --template-file infra/main.bicep \
      --parameters infra/main.prod.bicepparam \
      --what-if
*/
using './main.bicep'

param environment = 'prod'
param containerRegistryServer = 'burnbuddyacr.azurecr.io'
param imageTag = 'latest'
param keyVaultName = 'buddyburn-prod-kv'
param keyVaultResourceGroup = 'buddyburn-prod'
