import React from "react";
import { motion } from "motion/react";
import { cn } from "../../utils/cn.utils";

export const ShowBlockComponent = ({
  children,
  delay = 0.2,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.6,
        delay: delay,
        ease: [0, 0.71, 0.2, 1.01],
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
};
