/*
  Development parameter file for buddyburn infrastructure.
  Deploy to resource group: buddyburn-dev

  az deployment group create \
    --resource-group buddyburn-dev \
    --template-file infra/main.bicep \
    --parameters infra/main.dev.bicepparam

  Dry run:
    az deployment group create \
      --resource-group buddyburn-dev \
      --template-file infra/main.bicep \
      --parameters infra/main.dev.bicepparam \
      --what-if
*/
using './main.bicep'

param environment = 'dev'
param containerRegistryServer = 'burnbuddyacr.azurecr.io'
param imageTag = 'dev'
param keyVaultName = 'buddyburn-dev-kv'
param keyVaultResourceGroup = 'buddyburn-dev'
