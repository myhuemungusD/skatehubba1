import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";

export function useAuthListener() {
  const initialize = useAuthStore((state) => state.initialize);
  const handleRedirectResult = useAuthStore((state) => state.handleRedirectResult);

  useEffect(() => {
    void handleRedirectResult();
  }, [handleRedirectResult]);

  useEffect(() => {
    void initialize();
  }, [initialize]);
}
