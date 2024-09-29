import type { Component } from "solid-js";
import Columns from "../features/Column/components/Columns";
import { DeckProvider } from "../features/Column/context/deck";
import Sidebar from "../features/Sidebar/components/Sidebar";

const index: Component = () => {
  return (
    <DeckProvider>
      <div class="flex h-svh w-screen divide-x text-zinc-8">
        <Sidebar />
        <Columns />
      </div>
    </DeckProvider>
  );
};

export default index;
