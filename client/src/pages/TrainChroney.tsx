import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Brain, Save, Check, Plus, Trash2, Edit2, X, AlertCircle } from "lucide-react";

interface WidgetSettings {
  id: string;
  businessAccountId: string;
  customInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

interface Instruction {
  id: string;
  text: string;
}

export default function TrainChroney() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [hasLegacyData, setHasLegacyData] = useState(false);
  const [legacyText, setLegacyText] = useState("");
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instructionToDelete, setInstructionToDelete] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });

  // Parse instructions from settings when loaded
  useEffect(() => {
    if (settings?.customInstructions) {
      try {
        const parsed = JSON.parse(settings.customInstructions);
        if (Array.isArray(parsed)) {
          setInstructions(parsed);
          setHasLegacyData(false);
        } else {
          // Invalid JSON, treat as empty
          setInstructions([]);
          setHasLegacyData(false);
        }
      } catch {
        // JSON parse failed - this is legacy plain text format
        const trimmed = settings.customInstructions.trim();
        if (trimmed) {
          setHasLegacyData(true);
          setLegacyText(trimmed);
          // Don't set instructions yet - wait for user to migrate
        } else {
          setInstructions([]);
          setHasLegacyData(false);
        }
      }
    } else {
      setInstructions([]);
      setHasLegacyData(false);
    }
  }, [settings]);

  // Auto-save effect with debouncing (only after user interaction)
  useEffect(() => {
    if (!settings || !userHasInteracted || hasLegacyData) return;
    
    const currentInstructionsStr = JSON.stringify(instructions);
    const savedInstructionsStr = settings.customInstructions || "[]";
    
    const hasChanges = currentInstructionsStr !== savedInstructionsStr;

    if (!hasChanges) {
      setSaveStatus("idle");
      return;
    }
    
    const timeoutId = setTimeout(() => {
      setSaveStatus("saving");
      updateMutation.mutate({ customInstructions: currentInstructionsStr });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [instructions, settings, userHasInteracted, hasLegacyData]);

  const updateMutation = useMutation({
    mutationFn: async (data: { customInstructions: string }) => {
      const response = await fetch("/api/widget-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update custom instructions");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/widget-settings"] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save custom instructions",
        variant: "destructive",
      });
      setSaveStatus("idle");
    },
  });

  const handleMigrateLegacy = () => {
    // Convert legacy text to instruction list (split by lines)
    const lines = legacyText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const migratedInstructions: Instruction[] = lines.map((line, index) => ({
      id: `migrated-${Date.now()}-${index}`,
      text: line.replace(/^[-*•]\s*/, ''), // Remove bullet points
    }));
    
    setInstructions(migratedInstructions);
    setHasLegacyData(false);
    setUserHasInteracted(true);
    
    toast({
      title: "Migration Complete",
      description: `Converted ${migratedInstructions.length} instruction(s) to the new format.`,
    });
  };

  const handleDiscardLegacy = () => {
    setHasLegacyData(false);
    setLegacyText("");
    setInstructions([]);
    setUserHasInteracted(true);
  };

  const handleAddInstruction = () => {
    if (!newInstruction.trim()) return;
    
    const newInstr: Instruction = {
      id: Date.now().toString(),
      text: newInstruction.trim(),
    };
    
    setInstructions([...instructions, newInstr]);
    setNewInstruction("");
    setUserHasInteracted(true);
  };

  const handleDeleteClick = (id: string) => {
    setInstructionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (instructionToDelete) {
      setInstructions(instructions.filter(instr => instr.id !== instructionToDelete));
      setUserHasInteracted(true);
    }
    setDeleteDialogOpen(false);
    setInstructionToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setInstructionToDelete(null);
  };

  const handleStartEdit = (instruction: Instruction) => {
    setEditingId(instruction.id);
    setEditText(instruction.text);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleSaveEdit = () => {
    if (!editText.trim() || !editingId) return;
    
    setInstructions(instructions.map(instr => 
      instr.id === editingId 
        ? { ...instr, text: editText.trim() }
        : instr
    ));
    
    setEditingId(null);
    setEditText("");
    setUserHasInteracted(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Brain className="w-6 h-6 text-purple-600" />
                Train Chroney
              </CardTitle>
              <CardDescription>
                Add custom instructions one by one to customize Chroney's behavior
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "saving" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Save className="w-4 h-4 animate-pulse" />
                  <span>Saving...</span>
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  <span>Saved</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Legacy Data Migration Banner */}
          {hasLegacyData && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 mb-2">
                    Legacy Instructions Detected
                  </h3>
                  <p className="text-sm text-amber-800 mb-3">
                    You have existing instructions in the old format. Would you like to migrate them to the new list-based format?
                  </p>
                  <div className="p-3 bg-white rounded border border-amber-200 mb-3 max-h-32 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                      {legacyText}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleMigrateLegacy}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      Migrate to New Format
                    </Button>
                    <Button
                      onClick={handleDiscardLegacy}
                      size="sm"
                      variant="outline"
                    >
                      Start Fresh (Discard Old)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!hasLegacyData && (
            <>
              {/* Add New Instruction */}
              <div>
                <div className="flex gap-2">
                  <Input
                    value={newInstruction}
                    onChange={(e) => setNewInstruction(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAddInstruction()}
                    placeholder="Type a new instruction and press Enter or click Add..."
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleAddInstruction}
                    disabled={!newInstruction.trim()}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Add instructions in plain English - no coding required!
                </p>
              </div>

              {/* Instructions List */}
              <div className="space-y-3">
                {instructions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No instructions yet. Add your first instruction above!</p>
                  </div>
                ) : (
                  instructions.map((instruction, index) => (
                    <div 
                      key={instruction.id}
                      className="p-4 border rounded-lg bg-white hover:shadow-sm transition-shadow"
                    >
                      {editingId === instruction.id ? (
                        // Edit Mode
                        <div className="flex gap-2">
                          <Input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleSaveEdit()}
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            disabled={!editText.trim()}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        // View Mode
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-purple-600 mt-0.5">
                            {index + 1}.
                          </span>
                          <p className="flex-1 text-sm text-gray-700">{instruction.text}</p>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(instruction)}
                              className="h-8 w-8 p-0 hover:bg-blue-50"
                            >
                              <Edit2 className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteClick(instruction.id)}
                              className="h-8 w-8 p-0 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-900 mb-2">💡 How it works:</p>
            <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
              <li>Add instructions one by one using the input field above</li>
              <li>Edit or delete individual instructions anytime</li>
              <li>Chroney will follow these rules in every customer conversation</li>
              <li>Changes save automatically and apply immediately</li>
              <li>Instructions are private to your business only</li>
            </ul>
          </div>

          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm font-medium text-amber-900 mb-2">📝 Example Instructions:</p>
            <ul className="text-xs text-amber-800 space-y-1">
              <li>"When customer asks about pricing, mention our payment plans"</li>
              <li>"Always mention our 30-day return policy"</li>
              <li>"For wholesale inquiries, ask for company name and tax ID"</li>
              <li>"Use friendly and professional language"</li>
              <li>"When customer provides contact info, ask for their name politely"</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Instruction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this instruction? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
