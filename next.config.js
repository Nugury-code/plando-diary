/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16이 실행할 때마다 AGENTS.md / CLAUDE.md 파일을 자동으로
  // 만드는 기능이 있는데, 이 저장소에는 필요 없어서 꺼둡니다.
  agentRules: false,
};

module.exports = nextConfig;
