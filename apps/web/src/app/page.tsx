import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const setupItems = [
  "Next.js web app",
  "NestJS game-server",
  "pnpm workspace",
  "Shared packages",
  "AI agent implementation docs",
];

const nextItems = [
  "Drizzle schema",
  "Better Auth",
  "Point wallet",
  "Blackjack engine",
  "Realtime table state machine",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="flex flex-col gap-3">
          <Badge className="w-fit" variant="secondary">
            Initial setup
          </Badge>
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
              BK Games
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              무료 포인트 기반 실시간 블랙잭 MVP를 위한 모노레포
              워크스페이스입니다.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ready</CardTitle>
              <CardDescription>초기 프로젝트 세팅</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {setupItems.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="size-2 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next</CardTitle>
              <CardDescription>문서 기준 다음 구현 순서</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3 text-sm">
                {nextItems.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="size-2 rounded-full bg-muted-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
