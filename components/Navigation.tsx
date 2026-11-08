import Link from "next/link";

export default function Navigation() {
  return (
    <nav className="flex gap-6 bg-slate-900 p-4 text-slate-200">
      <Link href="/">Main Banking App</Link>
      <Link href="/security">Security Dashboard</Link>
    </nav>
  );
}
