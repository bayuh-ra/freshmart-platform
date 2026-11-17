import { redirect } from 'next/navigation';

// The old phone-preview URL now goes to the customer website.
export default function ShopperRedirect() {
  redirect('/');
}
