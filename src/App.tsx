import { useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Card, CardContent } from "./components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar";

export default function App() {
  const [posts, setPosts] = useState([
    { id: 1, name: "Andre", city: "Stockholm", text: "Healthy is Wealthy", avatar: "" }
  ]);

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-screen-sm mx-auto h-14 flex items-center justify-between px-4">
          <div className="font-bold">LIV</div>
        </div>
      </header>

      {/* Feed */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {posts.map((p) => (
          <Card key={p.id} className="rounded-2xl">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={p.avatar} />
                  <AvatarFallback>{p.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.city}</p>
                </div>
              </div>
              <p>{p.text}</p>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
