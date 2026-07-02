import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;

/**
 * 开发骨架阶段允许未配置 Sanity 环境变量。
 * 当 projectId/dataset 未配置时，sanityClient 为 null，调用方应返回 null 或 mock 数据。
 */
export const sanityClient =
  projectId && dataset
    ? createClient({
        projectId,
        dataset,
        apiVersion: "2026-01-01",
        useCdn: true,
      })
    : null;
