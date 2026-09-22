import AuthGate from "./components/AuthGate";

export default function Home() {
  return (
    <div className="page">
      <h1>📔 플랜두씨 다이어리</h1>
      <p className="subtitle">계획한 것과 실제로 한 일을 한 곳에 담습니다.</p>
      <AuthGate />
    </div>
  );
}
