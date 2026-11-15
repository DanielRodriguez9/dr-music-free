import { useContext } from "react";
import { CollectionsContext, LibraryContext, PlayerContext, PlayerTimeContext, UIContext } from "./contexts";

function useRequired(ctx, name) {
  const value = useContext(ctx);
  if (!value) throw new Error(`${name} debe usarse dentro de su Provider`);
  return value;
}

export const useLibrary = () => useRequired(LibraryContext, "useLibrary");
export const usePlayer = () => useRequired(PlayerContext, "usePlayer");
export const usePlayerTime = () => useRequired(PlayerTimeContext, "usePlayerTime");
export const useUI = () => useRequired(UIContext, "useUI");
export const useCollections = () => useRequired(CollectionsContext, "useCollections");
