# Medusa 测试商品录入标准

## 目的

这份文档用于统一本地联调和后台录入时的字段规范，避免：

- 商品 slug 不一致
- metadata 键名不一致
- 前台筛选标签和后台录入字段脱节

## 推荐首批测试商品

- `口口舱X`
- `海狸`
- `含豆`

## 必填基础字段

| 字段 | 说明 | 示例 |
|---|---|---|
| `title` | 商品标题 | `口口舱X` |
| `handle` | 前台 slug | `kokocang-x` |
| `status` | 发布状态 | `published` |
| `description` | 简要描述 | 用于前台和后台识别 |
| `shipping_profile` | 配送配置 | 使用默认 profile |
| `sales channel` | 销售渠道 | 关联 storefront 渠道 |
| `variant.sku` | SKU | `KOKOCANG-X` |
| `variant.prices` | 价格 | `cny / usd` |

## metadata 字段规范

这些字段由前台直接读取或映射，键名不要随意改动。

| metadata 键 | 类型 | 示例 |
|---|---|---|
| `brand` | `string` | `享要` |
| `series` | `string` | `口口舱` |
| `material` | `string` | `液态硅胶 + POM + ABS` |
| `waterproof` | `string` | `IPX6` |
| `runtimeMinutes` | `number` | `45` |
| `chargeMinutes` | `number` | `150` |
| `weightGrams` | `number` | `336` |
| `sizeText` | `string` | `82.8*81.5*161.1mm` |
| `appControl` | `boolean` | `true` |
| `remoteControl` | `boolean` | `true` |
| `wearable` | `boolean` | `false` |
| `heating` | `boolean` | `false` |
| `coupleFriendly` | `boolean` | `true` |
| `stimulationType` | `string[]` | `["licking","suction","clitoral"]` |
| `beginnerLevel` | `number 1-5` | `3` |
| `intensityLevel` | `number 1-5` | `4` |
| `noiseLevel` | `number 1-5` | `3` |
| `discreetLevel` | `number 1-5` | `2` |
| `tags` | `string[]` | `["hero"]` |
| `collections` | `string[]` | `["app-controlled"]` |

## 测试商品建议值

### 口口舱X

```json
{
  "title": "口口舱X",
  "handle": "kokocang-x",
  "description": "女用外吸与舔吸双重体验产品，支持 App Control 和情侣远程互动。",
  "variant": {
    "sku": "KOKOCANG-X",
    "prices": [
      { "currency_code": "cny", "amount": 427 },
      { "currency_code": "usd", "amount": 59 }
    ]
  },
  "metadata": {
    "brand": "享要",
    "series": "口口舱",
    "material": "液态硅胶 + POM + ABS",
    "waterproof": "IPX6",
    "runtimeMinutes": 45,
    "chargeMinutes": 150,
    "weightGrams": 336,
    "sizeText": "82.8*81.5*161.1mm",
    "appControl": true,
    "remoteControl": true,
    "wearable": false,
    "heating": false,
    "coupleFriendly": true,
    "stimulationType": ["licking", "suction", "clitoral"],
    "beginnerLevel": 3,
    "intensityLevel": 4,
    "noiseLevel": 3,
    "discreetLevel": 2,
    "tags": ["hero"],
    "collections": ["clitoral-licking", "app-controlled"]
  }
}
```

### 海狸

```json
{
  "title": "海狸",
  "handle": "haili",
  "description": "贴合穿戴、安静隐蔽，适合情侣远程互动与日常 discreet play。",
  "variant": {
    "sku": "HAILI",
    "prices": [
      { "currency_code": "cny", "amount": 229 },
      { "currency_code": "usd", "amount": 32 }
    ]
  },
  "metadata": {
    "brand": "享要",
    "series": "穿戴",
    "material": "硅胶 + ABS",
    "waterproof": "IPX7",
    "runtimeMinutes": 50,
    "chargeMinutes": 70,
    "weightGrams": 61,
    "sizeText": "85.5*43*99mm",
    "appControl": true,
    "remoteControl": true,
    "wearable": true,
    "heating": false,
    "coupleFriendly": true,
    "stimulationType": ["dual", "clitoral", "insertable"],
    "beginnerLevel": 4,
    "intensityLevel": 3,
    "noiseLevel": 4,
    "discreetLevel": 5,
    "tags": ["wearable"],
    "collections": ["wearable", "discreet-play", "app-controlled", "couples"]
  }
}
```

### 含豆

```json
{
  "title": "含豆",
  "handle": "handou",
  "description": "外吸与入体双刺激的进阶产品，适合主推双刺激体验场景。",
  "variant": {
    "sku": "HANDOU",
    "prices": [
      { "currency_code": "cny", "amount": 327 },
      { "currency_code": "usd", "amount": 45 }
    ]
  },
  "metadata": {
    "brand": "享要",
    "series": "含豆",
    "material": "ABS + 硅胶 + 液态硅胶",
    "waterproof": "IPX6",
    "runtimeMinutes": 90,
    "chargeMinutes": 60,
    "weightGrams": 206,
    "sizeText": "90*28mm",
    "appControl": true,
    "remoteControl": true,
    "wearable": false,
    "heating": false,
    "coupleFriendly": false,
    "stimulationType": ["dual", "suction", "insertable", "clitoral"],
    "beginnerLevel": 3,
    "intensityLevel": 4,
    "noiseLevel": 4,
    "discreetLevel": 3,
    "tags": ["dual"],
    "collections": ["dual-stimulation", "app-controlled"]
  }
}
```

## 推荐用法

优先使用本地种子脚本：

```bash
cd /workspace/apps/medusa
npm run backend:seed:local
```

如果后面你们改为手动在 Admin 中维护商品，也请尽量保持以上字段不变。
