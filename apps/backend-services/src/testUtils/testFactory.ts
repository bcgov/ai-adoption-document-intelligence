import { ResolvedIdentity } from "@/auth/types";
import { $Enums } from "@/generated";

const TestFactory = () => {
  const makeIdentity = (props?: {
    userId?: string;
    groupRoles?: Record<string, $Enums.GroupRole>;
    actorId: string;
    isSystemAdmin: boolean;
  }): ResolvedIdentity => {
    return {
      userId: "user",
      actorId: "actor",
      groupRoles: {},
      isSystemAdmin: false,
      ...props,
    };
  };

  return {
    makeIdentity,
  };
};
export default TestFactory;
