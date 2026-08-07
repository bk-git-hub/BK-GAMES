import { redirect } from "next/navigation";

type LobbyPageProps = {
  searchParams?: Promise<{
    code?: string | string[];
    date?: string | string[];
    reward?: string | string[];
  }>;
};

export default async function LobbyPage({ searchParams }: LobbyPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  setFirstQueryValue(query, "reward", params?.reward);
  setFirstQueryValue(query, "date", params?.date);
  setFirstQueryValue(query, "code", params?.code);

  const queryString = query.toString();

  redirect(queryString ? `/?${queryString}` : "/");
}

function setFirstQueryValue(
  query: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  const firstValue = Array.isArray(value) ? value[0] : value;

  if (firstValue) {
    query.set(key, firstValue);
  }
}
