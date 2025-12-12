import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, Settings } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export function SystemSettings() {
    const [burstLimit, setBurstLimit] = useState<number>(2);
    const [apiKey, setApiKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (open) {
            fetchSettings();
        }
    }, [open]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                if (data.catchup_burst_limit) {
                    setBurstLimit(data.catchup_burst_limit);
                }
                if (data.gemini_api_key) {
                    setApiKey(data.gemini_api_key);
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    catchup_burst_limit: Number(burstLimit),
                    gemini_api_key: apiKey
                })
            });
            if (res.ok) {
                toast.success("Ayarlar başarıyla kaydedildi.");
                setOpen(false);
            } else {
                toast.error("Kaydedilemedi.");
            }
        } catch (error) {
            toast.error("Hata oluştu.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    Sistem Ayarları
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Sistem Yapılandırması</DialogTitle>
                    <DialogDescription>
                        Yapay zeka anahtarı ve dosya dağıtım ayarlarını buradan yönetebilirsiniz.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* AI Configuration */}
                    <div className="grid gap-2">
                        <Label htmlFor="apikey" className="font-bold">Google Gemini API Anahtarı</Label>
                        <Input
                            id="apikey"
                            type="password"
                            placeholder="AIzaSy..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Akıllı analiz için gereklidir. Anahtar yoksa yerel mod çalışır.
                        </p>
                    </div>

                    <div className="border-t"></div>

                    {/* Assignment Logic */}
                    <div className="grid gap-2">
                        <Label htmlFor="burst" className="font-bold">Nefes Alma Limiti (Catch-up)</Label>
                        <Input
                            id="burst"
                            type="number"
                            min="1"
                            max="10"
                            value={burstLimit}
                            onChange={(e) => setBurstLimit(Number(e.target.value))}
                        />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Borçlu avukata üst üste verilecek maksimum dosya.
                        </p>
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Kaydet"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
