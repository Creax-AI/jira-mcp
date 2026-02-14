import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Zap, Globe, Key, Settings, LogOut, ChevronRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "workspaces", label: "Workspaces", icon: Globe },
  { to: "tokens", label: "API Tokens", icon: Key },
  { to: "settings", label: "Settings", icon: Settings },
];

function SidebarNav({ onClick }: { onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onClick}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          <ChevronRight className="ml-auto h-4 w-4 opacity-0 group-[.active]:opacity-100" />
        </NavLink>
      ))}
    </nav>
  );
}

export function DashboardLayout() {
  const { userEmail, logout } = useAuth();
  const navigate = useNavigate();

  const initials = userEmail ? userEmail.split("@")[0].slice(0, 2).toUpperCase() : "??";

  async function onLogout() {
    try {
      await logout();
      navigate("/");
    } catch {
      // handled by auth context
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetHeader className="mb-6">
                <SheetTitle className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Zap className="h-4 w-4" />
                  </div>
                  Jira MCP
                </SheetTitle>
              </SheetHeader>
              <SidebarNav />
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <NavLink to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight hidden sm:inline-block">
              Jira MCP
            </span>
          </NavLink>

          <div className="ml-auto" />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 gap-2 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline-block">{userEmail}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium">{userEmail}</p>
                <p className="text-xs text-muted-foreground">Signed in</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate("/dashboard/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void onLogout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-background p-4">
          <SidebarNav />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
