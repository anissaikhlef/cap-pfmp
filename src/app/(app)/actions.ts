"use server";
import { redirect } from "next/navigation";
import { fermerSession } from "@/lib/auth";

export async function seDeconnecter() {
  await fermerSession();
  redirect("/connexion");
}
