import { redirect } from 'next/navigation';

// Staff sign-in moved to /staff (customers use the shop at "/").
export default function LoginRedirect() {
  redirect('/staff');
}
