import type { Auth } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    auth: Auth;
    user: SessionUser | null;
  };
};
