import { redirect } from 'next/navigation';

// Personal details now live on /account; keep old links working.
export default function ProfilePage() {
  redirect('/account');
}
