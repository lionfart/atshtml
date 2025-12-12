"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search, ArrowLeft, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface FileCase {
    id: string;
    registration_number: string;
    plaintiff: string;
    subject: string;
    lawyer_id: string | null;
    lawyer_name: string;
    created_at: string;
    status: 'OPEN' | 'CLOSED';
    latest_activity_type?: string;
    latest_decision_result?: string;
}

export default function FilesPage() {
    const [files, setFiles] = useState<FileCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchFiles();
    }, [searchTerm]);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (searchTerm) p.append("q", searchTerm);

            const res = await fetch(`/api/files?${p.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setFiles(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getDecisionBadgeVariant = (result?: string) => {
        if (!result) return "outline";
        const r = result.toUpperCase();
        if (r.includes("KABUL")) return "default"; // Green-ish usually
        if (r.includes("RED")) return "destructive"; // Red
        if (r.includes("KISMEN")) return "secondary"; // Gray/Yellow
        return "secondary";
    };

    return (
        <div className="container mx-auto p-8 space-y-6">
            <div className="flex items-center space-x-4">
                <Link href="/">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Dosya Arşivi</h1>
            </div>

            <Card>
                <CardHeader>
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Dosya no, davacı veya konu ara..."
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Dosya No</TableHead>
                                    <TableHead>Davacı</TableHead>
                                    <TableHead className="hidden md:table-cell">Konu</TableHead>
                                    <TableHead>Son İşlem / Durum</TableHead>
                                    <TableHead>Avukat</TableHead>
                                    <TableHead>Tarih</TableHead>
                                    <TableHead className="text-right">İşlem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" /> Yükleniyor...
                                        </TableCell>
                                    </TableRow>
                                ) : files.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            Dosya bulunamadı.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    files.map((file) => (
                                        <TableRow key={file.id}>
                                            <TableCell className="font-medium">{file.registration_number}</TableCell>
                                            <TableCell>{file.plaintiff}</TableCell>
                                            <TableCell className="hidden md:table-cell truncate max-w-[200px]">{file.subject}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1 items-start">
                                                    {file.latest_activity_type && (
                                                        <span className="text-xs font-medium text-muted-foreground">
                                                            {file.latest_activity_type}
                                                        </span>
                                                    )}
                                                    {file.latest_decision_result && (
                                                        <Badge variant={getDecisionBadgeVariant(file.latest_decision_result) as any}>
                                                            {file.latest_decision_result}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{file.lawyer_name}</TableCell>
                                            <TableCell>{new Date(file.created_at).toLocaleDateString('tr-TR')}</TableCell>
                                            <TableCell className="text-right">
                                                <Link href={`/files/${file.id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        <Eye className="mr-2 h-4 w-4" />
                                                        İncele
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
