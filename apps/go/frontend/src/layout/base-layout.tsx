import React from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";

import {
  SidebarInset,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarTrigger,
} from "../shared/components/ui/sidebar";
import { ROUTES_PATH } from "../routes/routes";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <SidebarTrigger />
            <span className="text-sm font-semibold">Menu</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={false}>
                <Link to={ROUTES_PATH.Home}>
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={false}>
                <Link to={ROUTES_PATH.Settings}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <div className="flex flex-1 flex-col gap-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
