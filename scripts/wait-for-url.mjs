import process from 'node:process';

const url = process.argv[2];
const deadline = Date.now() + 120_000;

if (!url) throw new Error('A URL is required');

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) process.exit(0);
  } catch {
    // The service is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

throw new Error(`Timed out waiting for ${url}`);
