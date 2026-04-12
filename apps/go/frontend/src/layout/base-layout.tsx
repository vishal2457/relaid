import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home } from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "../shared/components/ui/navigation-menu";
import { cn } from "../shared/utils/cn.utils";
import { ROUTES_PATH } from "../routes/routes";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4">
          <Link
            to={ROUTES_PATH.Home}
            className="mr-6 flex items-center space-x-2"
          >
            <span className="text-sm font-bold">Relaid</span>
          </Link>
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  asChild
                  className={navigationMenuTriggerStyle()}
                >
                  <Link
                    to={ROUTES_PATH.Home}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      location.pathname === ROUTES_PATH.Home &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <Home className="mr-2 h-4 w-4" />
                    Home
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
