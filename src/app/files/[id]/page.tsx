"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
    Loader2, ArrowLeft, Trash2, FileText, Send,
    Save, Plus, Paperclip, MoreVertical, Pencil, Info
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface CaseFile {
    id: string;
    registration_number: string;
    plaintiff: string;
    subject: string;
    status: 'OPEN' | 'CLOSED';
    lawyer_id: string | null;
    lawyer_name?: string;
    created_at: string;
    latest_activity_type?: string;
    latest_activity_date?: string;
    latest_decision_result?: string;
    documents: {
        id: string;
        name: string;
        upload_date: string;
        type?: string;
        analysis?: {
            type: string;
            summary: string;
        };
    }[];
}

interface Note {
    id: string;
    author_name: string;
    content: string;
    created_at: string;
}

export default function FileDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    // const { toast } = useToast(); // Removed

    // State
    const [file, setFile] = useState<CaseFile | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Edit Form Data
    const [formData, setFormData] = useState({
        plaintiff: "",
        subject: "",
        registration_number: ""
    });

    // Notes State
    const [newNote, setNewNote] = useState("");
    const [sendingNote, setSendingNote] = useState(false);

    // Upload State
    const [uploading, setUploading] = useState(false);
    const [scanEnabled, setScanEnabled] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Fetch
    useEffect(() => {
        if (id) {
            fetchFile();
            fetchNotes();
        }
    }, [id]);

    const fetchFile = async () => {
        try {
            const res = await fetch(`/api/files/${id}`);
            if (!res.ok) throw new Error("Dosya bulunamadı");
            const data = await res.json();
            setFile(data);
            setFormData({
                plaintiff: data.plaintiff,
                subject: data.subject || "",
                registration_number: data.registration_number
            });
        } catch (error) {
            toast.error("Dosya yüklenemedi.");
        } finally {
            setLoading(false);
        }
    };

    const fetchNotes = async () => {
        try {
            const res = await fetch(`/api/files/${id}/notes`);
            if (res.ok) {
                const data = await res.json();
                setNotes(data.sort((a: Note, b: Note) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            }
        } catch (e) { console.error(e); }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/files/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                toast.success("Değişiklikler kaydedildi.");
                fetchFile();
            } else {
                toast.error("Kaydedilemedi.");
            }
        } catch (e) { toast.error("Hata oluştu."); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!confirm("Bu dosyayı ve tüm içeriğini silmek istediğinize emin misiniz?")) return;
        try {
            const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Dosya silindi.");
                window.location.href = '/files';
            } else {
                toast.error("Silinemedi.");
            }
        } catch (e) { toast.error("Hata."); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;

        const fileToUpload = e.target.files[0];
        const fd = new FormData();
        fd.append('file', fileToUpload);

        setUploading(true);
        try {
            const res = await fetch(`/api/files/${id}/upload?scan=${scanEnabled}`, {
                method: 'POST',
                body: fd
            });

            if (res.ok) {
                toast.success("Evrak yüklendi.");
                if (fileInputRef.current) fileInputRef.current.value = "";
                fetchFile();
                fetchNotes(); // Refresh notes to see AI scan result
            } else {
                toast.error("Yükleme başarısız.");
            }
        } catch (e) { toast.error("Hata."); }
        finally { setUploading(false); }
    };

    const handleDeleteDocument = async (docId: string) => {
        if (!confirm("Bu evrakı silmek istediğinize emin misiniz?")) return;

        try {
            const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Evrak silindi.");
                fetchFile();
            } else {
                toast.error("Silinemedi.");
            }
        } catch (e) { toast.error("Hata."); }
    }

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        setSendingNote(true);
        try {
            const res = await fetch(`/api/files/${id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newNote,
                    lawyer_id: null // In future, use real auth user
                })
            });

            if (res.ok) {
                setNewNote("");
                fetchNotes();
                toast.success("Not eklendi.");
            }
        } catch (e) { toast.error("Hata."); }
        finally { setSendingNote(false); }
    };

    // Rename State
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const handleStartRename = (doc: any) => {
        setRenamingId(doc.id);
        setRenameValue(doc.name);
    }

    const handleRenameSubmit = async (docId: string) => {
        if (!renameValue.trim()) return;
        try {
            const res = await fetch(`/api/documents/${docId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: renameValue })
            });

            if (res.ok) {
                toast.success("İsim güncellendi.");
                setRenamingId(null);
                fetchFile();
            } else {
                toast.error("Güncellenemedi.");
            }
        } catch (e) { toast.error("Hata."); }
    };

    const handleViewDocument = (docId: string) => {
        // Open in new tab
        window.open(`/api/documents/${docId}/download`, '_blank');
    };

    if (loading) return <div className="p-8"><Loader2 className="animate-spin" /> Yükleniyor...</div>;
    if (!file) return null;

    return (
        <div className="container mx-auto p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/files">
                        <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{file.registration_number}</h1>
                        <p className="text-muted-foreground text-sm">Oluşturulma: {new Date(file.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <div className="flex space-x-2">
                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                        <Trash2 className="mr-2 h-4 w-4" /> Dosyayı Sil
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COLUMN: Metadata & Notes */}
                <div className="lg:col-span-2 space-y-6">
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="details">Dosya Bilgileri</TabsTrigger>
                            <TabsTrigger value="notes">Süreç & Notlar</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="space-y-4 pt-4">
                            <Card>
                                <CardHeader><CardTitle>Temel Bilgiler</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-2">
                                        <Label>Davacı</Label>
                                        <Input
                                            value={formData.plaintiff}
                                            onChange={(e) => setFormData({ ...formData, plaintiff: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Dosya No</Label>
                                        <Input
                                            value={formData.registration_number}
                                            onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Dava Konusu</Label>
                                        <Textarea
                                            className="min-h-[100px]"
                                            value={formData.subject}
                                            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        />
                                    </div>
                                    <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Değişiklikleri Kaydet
                                    </Button>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="notes" className="space-y-4 pt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Notlar ve İşlem Geçmişi</CardTitle>
                                    <CardDescription>Bu dosyaya dair alınan notlar ve sistem kayıtları.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Yeni not ekle..."
                                            value={newNote}
                                            onChange={(e) => setNewNote(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                        />
                                        <Button size="icon" onClick={handleAddNote} disabled={sendingNote}>
                                            {sendingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                        {notes.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Henüz not yok.</p> : notes.map(note => (
                                            <div key={note.id} className="border rounded-lg p-3 bg-muted/30 text-sm">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-semibold text-primary">{note.author_name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(note.created_at).toLocaleString('tr-TR')}
                                                    </span>
                                                </div>
                                                <p className="whitespace-pre-wrap">{note.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* RIGHT COLUMN: Documents & Status */}
                <div className="space-y-6">
                    {/* Status Card */}
                    <Card>
                        <CardHeader><CardTitle>Durum</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            {file.latest_activity_type && (
                                <div className="pt-2 border-t">
                                    <Label className="text-xs text-muted-foreground block mb-1">Son İşlem</Label>
                                    <span className="font-medium text-sm flex items-center">
                                        {file.latest_activity_type}
                                    </span>
                                    {file.latest_decision_result && (
                                        <Badge
                                            className="mt-2"
                                            variant={
                                                file.latest_decision_result.includes("RED") ? "destructive" :
                                                    file.latest_decision_result.includes("KABUL") ? "default" : "secondary"
                                            }
                                        >
                                            {file.latest_decision_result}
                                        </Badge>
                                    )}
                                    {file.latest_activity_date && (
                                        <span className="text-xs text-muted-foreground block mt-1">
                                            {new Date(file.latest_activity_date).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div>
                                <Label className="text-xs text-muted-foreground">Atanan Avukat</Label>
                                <div className="font-semibold text-lg">{file.lawyer_name || "Bilinmiyor"}</div>
                            </div>
                            <div>
                                <Badge variant={file.status === 'OPEN' ? 'default' : 'secondary'}>
                                    {file.status === 'OPEN' ? 'Açık Dosya' : 'Kapalı'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Documents Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex justify-between items-center">
                                Evraklar
                                <span className="text-sm font-normal text-muted-foreground">({file.documents.length})</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Upload Area */}
                            <div className="border border-dashed rounded-lg p-4 bg-muted/20">
                                <Label className="text-sm font-semibold mb-2 block">Yeni Evrak Ekle</Label>
                                <div className="flex items-center space-x-2 mb-3">
                                    <Checkbox
                                        id="scan"
                                        checked={scanEnabled}
                                        onCheckedChange={(c) => setScanEnabled(c as boolean)}
                                    />
                                    <Label htmlFor="scan" className="cursor-pointer text-sm">
                                        Yapay Zeka ile İncele
                                    </Label>
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        ref={fileInputRef}
                                        type="file"
                                        className="text-xs"
                                        disabled={uploading}
                                        onChange={handleFileUpload}
                                    />
                                </div>
                                {uploading && <div className="text-xs text-muted-foreground mt-2 flex items-center"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Yükleniyor...</div>}
                            </div>

                            {/* List */}
                            <div className="space-y-2">
                                {file.documents.map(doc => (
                                    <div key={doc.id} className="flex items-center p-2 border rounded-md bg-white hover:bg-gray-50 transition-colors group">
                                        <div
                                            className="cursor-pointer mr-3 p-1.5 rounded bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors"
                                            onClick={() => handleViewDocument(doc.id)}
                                            title="Görüntüle"
                                        >
                                            <FileText className="h-6 w-6" />
                                        </div>

                                        <div className="flex-1 min-w-0 mr-2">
                                            {renamingId === doc.id ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        className="h-7 text-sm"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleRenameSubmit(doc.id);
                                                            if (e.key === 'Escape') setRenamingId(null);
                                                        }}
                                                    />
                                                    <Button size="icon" className="h-7 w-7" onClick={() => handleRenameSubmit(doc.id)}>
                                                        <Save className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <>
                                                    <HoverCard>
                                                        <HoverCardTrigger asChild>
                                                            <p
                                                                className="text-sm font-medium truncate cursor-pointer hover:underline"
                                                                onClick={() => handleViewDocument(doc.id)}
                                                            >
                                                                {doc.name}
                                                            </p>
                                                        </HoverCardTrigger>
                                                        {(doc.analysis) && (
                                                            <HoverCardContent className="w-80">
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-semibold text-sm">{doc.analysis.type}</span>
                                                                        <Badge variant="outline" className="text-[10px]">AI Analiz</Badge>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                                                        {doc.analysis.summary}
                                                                    </p>
                                                                </div>
                                                            </HoverCardContent>
                                                        )}
                                                    </HoverCard>
                                                    <p className="text-xs text-muted-foreground">{new Date(doc.upload_date).toLocaleDateString()}</p>
                                                </>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                onClick={() => handleStartRename(doc)}
                                            >
                                                {/* Edit Icon - Pencil */}
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDeleteDocument(doc.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
