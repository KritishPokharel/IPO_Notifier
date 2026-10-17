import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">Only the 12 tracked ETFs have detail pages.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-sky-500 hover:underline">Back to overview</Link>
    </div>
  );
}
