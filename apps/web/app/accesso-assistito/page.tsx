import { LoginForm } from "../login/login-form";
import { demoAccounts } from "./accounts";
export default function AssistedLoginPage() {
  return <LoginForm accounts={demoAccounts} />;
}
