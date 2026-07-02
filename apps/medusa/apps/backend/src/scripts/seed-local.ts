import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function seedLocal({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT,
  );

  logger.info("Seeding local store setup...");

  const {
    result: [salesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        {
          name: "Website Storefront",
          description: "Primary sales channel for the headless storefront",
        },
      ],
    },
  });

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Website Publishable API Key",
          type: "publishable",
          created_by: "local-seed",
        },
      ],
    },
  });

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [salesChannel.id],
    },
  });

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "Brand Store",
          supported_currencies: [
            {
              currency_code: "cny",
              is_default: true,
            },
            {
              currency_code: "usd",
              is_default: false,
            },
          ],
          default_sales_channel_id: salesChannel.id,
        },
      ],
    },
  });

  const {
    result: [region],
  } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "China",
          currency_code: "cny",
          countries: ["cn"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });

  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: "cn",
        provider_id: "tp_system",
      },
    ],
  });

  const {
    result: [stockLocation],
  } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Shanghai Warehouse",
          address: {
            city: "Shanghai",
            country_code: "CN",
            address_1: "Pudong",
          },
        },
      ],
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfileResult[0];

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Shanghai delivery",
    type: "shipping",
    service_zones: [
      {
        name: "China",
        geo_zones: [
          {
            country_code: "cn",
            type: "country",
          },
        ],
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Local shipping for brand store orders.",
          code: "standard",
        },
        prices: [
          {
            currency_code: "cny",
            amount: 0,
          },
          {
            region_id: region.id,
            amount: 0,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [salesChannel.id],
    },
  });

  const { result: categories } = await createProductCategoriesWorkflow(
    container,
  ).run({
    input: {
      product_categories: [
        {
          name: "App-Controlled",
          is_active: true,
        },
        {
          name: "Wearable",
          is_active: true,
        },
        {
          name: "Dual Stimulation",
          is_active: true,
        },
      ],
    },
  });

  const appControlledCategory = categories.find(
    (cat) => cat.name === "App-Controlled",
  )!;
  const wearableCategory = categories.find((cat) => cat.name === "Wearable")!;
  const dualCategory = categories.find(
    (cat) => cat.name === "Dual Stimulation",
  )!;

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "口口舱X",
          category_ids: [appControlledCategory.id],
          description:
            "女用外吸与舔吸双重体验产品，支持 App Control 和情侣远程互动。",
          handle: "kokocang-x",
          weight: 336,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          variants: [
            {
              title: "Default",
              sku: "KOKOCANG-X",
              prices: [
                {
                  amount: 427,
                  currency_code: "cny",
                },
                {
                  amount: 59,
                  currency_code: "usd",
                },
              ],
              metadata: {
                appControl: true,
                remoteControl: true,
                wearable: false,
                heating: false,
                coupleFriendly: true,
                stimulationType: ["licking", "suction", "clitoral"],
                beginnerLevel: 3,
                intensityLevel: 4,
                noiseLevel: 3,
                discreetLevel: 2,
              },
            },
          ],
          metadata: {
            brand: "享要",
            series: "口口舱",
            material: "液态硅胶 + POM + ABS",
            waterproof: "IPX6",
            runtimeMinutes: 45,
            chargeMinutes: 150,
            weightGrams: 336,
            sizeText: "82.8*81.5*161.1mm",
            appControl: true,
            remoteControl: true,
            wearable: false,
            heating: false,
            coupleFriendly: true,
            stimulationType: ["licking", "suction", "clitoral"],
            beginnerLevel: 3,
            intensityLevel: 4,
            noiseLevel: 3,
            discreetLevel: 2,
            tags: ["hero"],
            collections: ["clitoral-licking", "app-controlled"],
          },
          sales_channels: [{ id: salesChannel.id }],
        },
        {
          title: "海狸",
          category_ids: [wearableCategory.id],
          description:
            "贴合穿戴、安静隐蔽，适合情侣远程互动与日常 discreet play。",
          handle: "haili",
          weight: 61,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          variants: [
            {
              title: "Default",
              sku: "HAILI",
              prices: [
                {
                  amount: 229,
                  currency_code: "cny",
                },
                {
                  amount: 32,
                  currency_code: "usd",
                },
              ],
              metadata: {
                appControl: true,
                remoteControl: true,
                wearable: true,
                heating: false,
                coupleFriendly: true,
                stimulationType: ["dual", "clitoral", "insertable"],
                beginnerLevel: 4,
                intensityLevel: 3,
                noiseLevel: 4,
                discreetLevel: 5,
              },
            },
          ],
          metadata: {
            brand: "享要",
            series: "穿戴",
            material: "硅胶 + ABS",
            waterproof: "IPX7",
            runtimeMinutes: 50,
            chargeMinutes: 70,
            weightGrams: 61,
            sizeText: "85.5*43*99mm",
            appControl: true,
            remoteControl: true,
            wearable: true,
            heating: false,
            coupleFriendly: true,
            stimulationType: ["dual", "clitoral", "insertable"],
            beginnerLevel: 4,
            intensityLevel: 3,
            noiseLevel: 4,
            discreetLevel: 5,
            tags: ["wearable"],
            collections: ["wearable", "discreet-play", "app-controlled", "couples"],
          },
          sales_channels: [{ id: salesChannel.id }],
        },
        {
          title: "含豆",
          category_ids: [dualCategory.id],
          description:
            "外吸与入体双刺激的进阶产品，适合主推双刺激体验场景。",
          handle: "handou",
          weight: 206,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          variants: [
            {
              title: "Default",
              sku: "HANDOU",
              prices: [
                {
                  amount: 327,
                  currency_code: "cny",
                },
                {
                  amount: 45,
                  currency_code: "usd",
                },
              ],
              metadata: {
                appControl: true,
                remoteControl: true,
                wearable: false,
                heating: false,
                coupleFriendly: false,
                stimulationType: ["dual", "suction", "insertable", "clitoral"],
                beginnerLevel: 3,
                intensityLevel: 4,
                noiseLevel: 4,
                discreetLevel: 3,
              },
            },
          ],
          metadata: {
            brand: "享要",
            series: "含豆",
            material: "ABS + 硅胶 + 液态硅胶",
            waterproof: "IPX6",
            runtimeMinutes: 90,
            chargeMinutes: 60,
            weightGrams: 206,
            sizeText: "90*28mm",
            appControl: true,
            remoteControl: true,
            wearable: false,
            heating: false,
            coupleFriendly: false,
            stimulationType: ["dual", "suction", "insertable", "clitoral"],
            beginnerLevel: 3,
            intensityLevel: 4,
            noiseLevel: 4,
            discreetLevel: 3,
            tags: ["dual"],
            collections: ["dual-stimulation", "app-controlled"],
          },
          sales_channels: [{ id: salesChannel.id }],
        },
      ],
    },
  });

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryItems.map((item) => ({
        location_id: stockLocation.id,
        stocked_quantity: 100,
        inventory_item_id: item.id,
      })),
    },
  });

  logger.info("Local seed finished.");
  logger.info(`Sales channel id: ${salesChannel.id}`);
  logger.info(`Publishable API key id: ${publishableApiKey.id}`);
  logger.info(`Region id: ${region.id}`);
}

