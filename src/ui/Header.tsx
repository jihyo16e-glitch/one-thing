export function Header({ sub, title }: { sub: string; title: string }) {
  return (
    <header className="head">
      <p className="sub">{sub}</p>
      <h1>{title}</h1>
    </header>
  );
}
