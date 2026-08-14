import { redirect } from 'next/navigation';

export default async function VideoDetailRedirect(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/dashboard/videos/${id}`);
}
