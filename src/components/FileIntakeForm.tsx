"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function FileIntakeForm({ onFileCreated }: { onFileCreated: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [plaintiff, setPlaintiff] = useState("");
    const [subject, setSubject] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAiUsed, setIsAiUsed] = useState(false);

    // --- PDF / Image Helpers ---

    const loadPdfJs = async () => {
        if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                const pdfjs = (window as any).pdfjsLib;
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(pdfjs);
            };
            script.onerror = () => reject(new Error("Failed to load PDF.js CDN"));
            document.head.appendChild(script);
        });
    };

    const convertPdfToImage = async (pdfFile: File): Promise<Blob> => {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (!context) throw new Error("Canvas context failed");
        await page.render({ canvasContext: context, viewport: viewport } as any).promise;

        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Canvas to Blob failed"));
            }, 'image/jpeg', 0.95);
        });
    };

    // --- Core OCR & Logic ---

    // This function performs the server upload AND the local analysis
    const performServerOcr = async (fileToUpload: File) => {
        const formData = new FormData();
        formData.append('file', fileToUpload);

        // 1. OCR Request
        const res = await fetch('/api/ocr', { method: 'POST', body: formData });
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Server OCR failed');
        }

        const data = await res.json();
        const text = data.text;
        console.log("OCR Result (Server):", text);

        // 2. Regex Extraction (Fallback)
        let plaintiffVal = "";
        const plaintiffMatch = text.match(/(?:Davacı|Davaci|İsim)\s*(?::|-)?\s*([^\n\r]+)/i);
        if (plaintiffMatch && plaintiffMatch[1]) plaintiffVal = plaintiffMatch[1].trim();

        let subjectVal = "";
        const subjectHeaderMatch = text.match(/(?:Konu|Dava\s*Konusu|Dava|Özet)\s*(?::|-)?\s*([\s\S]+?)(?:\n\s*[A-ZÜĞİŞÇÖ]|\n\n|$)/i);
        if (subjectHeaderMatch && subjectHeaderMatch[1]) {
            subjectVal = subjectHeaderMatch[1].trim();
        } else {
            // Fallback keywords
            const keywordMatch = text.match(/([^\.\n\r]*?(?:talebiyle|iptali talebi|arz ve talep|talebimden ibarettir)[^\.\n\r]*)/i);
            if (keywordMatch && keywordMatch[1]) subjectVal = keywordMatch[1].trim();
        }

        // 3. AI Analysis (Enhancement)
        let aiSuccess = false;
        try {
            toast.info("Yapay Zeka (Gemini)...");
            const aiRes = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (aiRes.ok) {
                const aiData = await aiRes.json();
                console.log("AI Result:", aiData);

                // Only override if AI returned valid data
                if (aiData.plaintiff) {
                    plaintiffVal = aiData.plaintiff;
                }
                if (aiData.subject) {
                    subjectVal = aiData.subject;
                    aiSuccess = true;
                }

                if (aiSuccess) {
                    setIsAiUsed(true);
                    toast.success("Yapay Zeka ile Analiz Yapıldı");
                }
            } else {
                console.warn("AI Analysis skipped or failed (using local logic)");
            }
        } catch (e) {
            console.error("AI Error:", e);
        }

        // 4. Local Smart Analysis (Cleaning)
        if (subjectVal) {
            subjectVal = subjectVal.replace(/^(konu|dava konusu|özet|özeti)\s*[:|-]?\s*/i, '');
            const fluffPhrases = [
                /fazlaya ilişkin haklarımız saklı kalmak kaydıyla/gi,
                /yukarıda arz ve izah edilen nedenlerle/gi,
                /saygılarımla arz ve talep ederim/gi,
                /gereğinin yapılmasını arz ederim/gi,
                /tarafından/gi,
                /hakkındadır/gi,
                /müvekkil/gi,
                /vekil eden/gi
            ];
            fluffPhrases.forEach(rgx => {
                subjectVal = subjectVal.replace(rgx, '');
            });
            subjectVal = subjectVal.replace(/\s+/g, ' ').trim();
            if (!aiSuccess && subjectVal.length > 200) {
                const firstSentence = subjectVal.match(/^.*?[.?!](?:\s|$)/);
                if (firstSentence) subjectVal = firstSentence[0].trim();
            }
        }

        // Update UI
        if (plaintiffVal && plaintiffVal.length > 2) setPlaintiff(plaintiffVal);
        if (subjectVal && subjectVal.length > 2) setSubject(subjectVal);

        if (!plaintiffVal && !subjectVal) {
            toast.warning("Veri çıkarılamadı.");
        } else {
            toast.success("İşlem tamamlandı.");
        }
    };

    const processOcr = async (selectedFile: File) => {
        setIsProcessing(true);
        try {
            try {
                await performServerOcr(selectedFile);
            } catch (err: any) {
                if (err.message && err.message.includes("TARANMIŞ PDF")) {
                    console.log("Scanned PDF detected. Converting...");
                    toast.info("Taranmış PDF -> Resim dönüşümü yapılıyor...");
                    try {
                        const imageBlob = await convertPdfToImage(selectedFile);
                        const imageFile = new File([imageBlob], "converted_scan.jpg", { type: "image/jpeg" });
                        await performServerOcr(imageFile);
                    } catch (convErr: any) {
                        toast.error("Dönüştürme Hatası: " + convErr.message);
                    }
                } else {
                    throw err;
                }
            }
        } catch (err: any) {
            console.error("OCR Flow Error:", err);
            toast.error("İşlem Başarısız: " + (err.message || "Hata"));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const f = e.target.files[0];
            setFile(f);
            setPlaintiff("");
            setSubject("");
            setIsAiUsed(false);
            await processOcr(f);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('plaintiff', plaintiff);
            formData.append('subject', subject);
            if (file) {
                formData.append('file', file);
            }

            const res = await fetch("/api/files/create", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed");
            }

            toast.success("Dosya oluşturuldu ve evrak eklendi!");
            setPlaintiff("");
            setSubject("");
            setFile(null);
            setIsAiUsed(false);
            onFileCreated();
        } catch (error: any) {
            toast.error("Kayıt hatası: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    Yeni Dosya Girişi
                    {isAiUsed && (
                        <span className="inline-flex items-center rounded-full border border-transparent bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Yapay Zeka (Gemini)
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="document">Evrak Yükle (Akıllı Analiz)</Label>
                        <Input id="document" type="file" accept="image/*, .pdf, .txt" onChange={handleFileChange} />
                        {isProcessing && <div className="text-sm text-muted-foreground flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analiz ediliyor...</div>}
                    </div>

                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="plaintiff">Davacı</Label>
                        <Input id="plaintiff" value={plaintiff} onChange={(e) => setPlaintiff(e.target.value)} placeholder="Taranan isim..." required />
                    </div>

                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="subject">Dava Konusu (Özet)</Label>
                        <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Taranan özet..." required />
                    </div>

                    <Button type="submit" disabled={isSubmitting || isProcessing} className="w-full">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sisteme Kaydet"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
