import "./globals.css";

export const metadata = {
  title: "플랜두씨 다이어리",
  description: "계획 - 실제로 한 일 - 돌아보기를 담는 다이어리",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
