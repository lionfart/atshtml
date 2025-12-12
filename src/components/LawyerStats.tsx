"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { Lawyer } from "../lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function LawyerStats({ refreshTrigger }: { refreshTrigger: number }) {
    const [lawyers, setLawyers] = useState<Lawyer[]>([]);

    const fetchLawyers = async () => {
        const res = await fetch("/api/lawyers");
        if (res.ok) {
            const data = await res.json();
            setLawyers(data);
        }
    };

    useEffect(() => {
        fetchLawyers();
    }, [refreshTrigger]);

    const toggleStatus = async (id: string, newStatus: string, date?: string) => {
        await fetch("/api/lawyers", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id,
                status: newStatus,
                leave_return_date: date
            }),
        });
        fetchLawyers();
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>Avukat Durumu & İş Yükü</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {lawyers.map((lawyer) => (
                        <div key={lawyer.id} className="flex items-center justify-between p-2 border rounded-lg">
                            <div>
                                <Link href={`/lawyers/${lawyer.id}`} className="hover:underline">
                                    <div className="font-semibold">{lawyer.name}</div>
                                </Link>
                                <div className="text-sm text-muted-foreground">
                                    Atanan: {lawyer.assigned_files_count} | Telafi Borcu: {lawyer.missed_assignments_count}
                                </div>
                                {lawyer.status === 'ON_LEAVE' && lawyer.leave_return_date && (
                                    <div className="text-xs text-amber-600 mt-1">
                                        Otomatik Dönüş: {new Date(lawyer.leave_return_date).toLocaleDateString("tr-TR")}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    checked={lawyer.status === 'ACTIVE'}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            // Switching to ACTIVE
                                            toggleStatus(lawyer.id, 'ACTIVE');
                                        } else {
                                            // Switching to ON_LEAVE -> Ask for date
                                            const date = prompt("Döneceği tarih (YYYY-MM-DD) [Boş bırakılabilir]:",
                                                new Date(Date.now() + 86400000).toISOString().split('T')[0]
                                            );
                                            toggleStatus(lawyer.id, 'ON_LEAVE', date || undefined);
                                        }
                                    }}
                                />
                                <Badge variant={lawyer.status === 'ACTIVE' ? "default" : "secondary"}>
                                    {lawyer.status === 'ACTIVE' ? 'Aktif' : 'İzinli'}
                                </Badge>
                            </div>
                        </div>
                    ))}
                    {lawyers.length === 0 && <div className="text-muted-foreground text-center">Henüz avukat eklenmedi.</div>}
                </div>
            </CardContent>
        </Card>
    );
}
