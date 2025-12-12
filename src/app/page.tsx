"use client";

import { useState } from "react";
import { FileIntakeForm } from "@/components/FileIntakeForm";
import { LawyerStats } from "@/components/LawyerStats";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SystemSettings } from "@/components/SystemSettings";

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newLawyerName, setNewLawyerName] = useState("");

  const refreshStats = () => setRefreshTrigger((prev) => prev + 1);

  const handleAddLawyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLawyerName.trim()) return;

    try {
      const res = await fetch("/api/lawyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLawyerName }),
      });
      if (res.ok) {
        toast.success("Avukat eklendi.");
        setNewLawyerName("");
        refreshStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="container mx-auto p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Adalet Takip Sistemi</h1>
          <p className="text-muted-foreground">
            Otomatik dosya dağıtım ve yönetim paneli.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/files">
            <Button variant="secondary">
              Dosya Arşivi
            </Button>
          </Link>
          <SystemSettings />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-8">
          <FileIntakeForm onFileCreated={refreshStats} />
        </div>

        <div className="space-y-8">
          <LawyerStats refreshTrigger={refreshTrigger} />


          {/* Quick Add Lawyer for Setup */}

          {/* Quick Add Lawyer for Setup */}
          <Card>
            <CardHeader>
              <CardTitle>Hızlı Avukat Ekle</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddLawyer} className="flex space-x-2">
                <Input
                  placeholder="Avukat Adı Soyadı"
                  value={newLawyerName}
                  onChange={(e) => setNewLawyerName(e.target.value)}
                />
                <Button type="submit">Ekle</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
