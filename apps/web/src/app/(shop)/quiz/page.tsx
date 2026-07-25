import Link from "next/link";
import { listProducts } from "@/lib/commerce/products";
import { AiQuiz } from "./quiz-ui";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuizPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const src = typeof sp.src === "string" ? sp.src : "direct";
  const product = typeof sp.product === "string" ? sp.product : null;
  const products = await listProducts();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Find Your Match</h1>
      <p className="mt-4 text-zinc-600">
        如果你不想一开始就在商品列表里反复横跳，这里会先按第一次购买、是否偏好 wearable、
        是否想要 App Control 和预算范围，帮你快速缩小到更接近的几款。
      </p>

      <AiQuiz source={src} sourceProductSlug={product} products={products} />

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/collection/first-time">
          Browse first-time picks
        </Link>
        <Link className="underline underline-offset-4" href="/shop">
          Shop all
        </Link>
      </div>
    </div>
  );
}
