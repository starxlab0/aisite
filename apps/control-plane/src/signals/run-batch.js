const { runBatchSnapshots } = require("./batch");

async function main() {
  const targetType = process.argv[2] || undefined;
  const targetId = process.argv[3] || undefined;
  const windowDays = process.argv[4] ? Number(process.argv[4]) : 7;

  const result = await runBatchSnapshots({ targetType, targetId, windowDays });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

