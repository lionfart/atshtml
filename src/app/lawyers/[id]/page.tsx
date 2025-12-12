"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface LawyerStats {
    totalFiles: number;
    openFiles: number;
    closedFiles: number;
    decisions: Record<string, number>;
}

interface Lawyer {
    id: string;
    name: string;
    status: 'ACTIVE' | 'ON_LEAVE';
    leave_return_date?: string;
}

export default function LawyerDashboard() {
    const params = useParams();
    const id = params?.id as string;

    const [lawyer, setLawyer] = useState<Lawyer | null>(null);
    const [stats, setStats] = useState<LawyerStats | null>(null);
    const [recentFiles, setRecentFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) fetchLawyerData();
    }, [id]);

    const fetchLawyerData = async () => {
        try {
            const res = await fetch(`/api/lawyers/${id}`);
            if (res.ok) {
                const data = await res.json();
                setLawyer(data.lawyer);
                setStats(data.stats);
                setRecentFiles(data.recentFiles);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    if (loading) return <div className="p-8"><Loader2 className="animate-spin" /> Yükleniyor...</div>;
    if (!lawyer) return <div className="p-8">Avukat bulunamadı.</div>;

    return (
        <div className="container mx-auto p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
                <Link href="/">
                    <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{lawyer.name}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <Badge variant={lawyer.status === 'ACTIVE' ? 'default' : 'secondary'}>
                            {lawyer.status === 'ACTIVE' ? 'Aktif' : 'İzinli'}
                        </Badge>
                        {lawyer.status === 'ON_LEAVE' && lawyer.leave_return_date && (
                            <span className="text-sm text-muted-foreground">
                                Dönüş: {lawyer.leave_return_date}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Toplam Dosya</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalFiles}</div>
                        <p className="text-xs text-muted-foreground">{stats?.openFiles} Açık, {stats?.closedFiles} Kapalı</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Karar İstatistikleri</CardTitle></CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            {Object.entries(stats?.decisions || {}).slice(0, 3).map(([key, val]) => (
                                <div key={key} className="flex justify-between text-sm">
                                    <span className="capitalize">{key.replace('DAVA ', '').replace('TAZMİNAT ', '').toLowerCase()}</span>
                                    <span className="font-semibold">{val}</span>
                                </div>
                            ))}
                            {Object.keys(stats?.decisions || {}).length === 0 && <span className="text-sm text-muted-foreground">Henüz karar yok.</span>}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ajanda / Notlar</CardTitle></CardHeader>
                    <CardContent>
                        <div className="h-[120px] bg-muted/20 rounded-md flex items-center justify-center border border-dashed">
                            <span className="text-muted-foreground text-xs text-center p-4">
                                Kişisel Ajanda ve Takvim<br />(Çok Yakında)
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Files */}
            <Card>
                <CardHeader><CardTitle>Son Atanan Dosyalar</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Dosya No</TableHead>
                                <TableHead>Davacı</TableHead>
                                <TableHead>Konu</TableHead>
                                <TableHead>Durum</TableHead>
                                <TableHead className="text-right">İşlem</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentFiles.map(file => (
                                <TableRow key={file.id}>
                                    <TableCell className="font-medium">{file.registration_number}</TableCell>
                                    <TableCell>{file.plaintiff}</TableCell>
                                    <TableCell className="truncate max-w-[200px]">{file.subject}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{file.latest_activity_type || 'Yeni'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Link href={`/files/${file.id}`}>
                                            <Button variant="ghost" size="sm">İncele</Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {recentFiles.length === 0 && (
                                <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Dosya yok.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
