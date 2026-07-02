type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrderPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Order: {id}
      </h1>
      <p className="mt-3 text-zinc-600">
        订单页骨架：后续从 Medusa 拉取订单状态与明细。
      </p>
    </div>
  );
}

