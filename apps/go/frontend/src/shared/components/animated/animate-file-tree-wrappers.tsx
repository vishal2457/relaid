import { AnimatePresence, motion } from "motion/react";

export const AnimatedFileTreeWrapper = ({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{
          delay: index * 0.05,
          duration: 0.2,
          ease: [0.4, 0, 0.2, 1],
        }}
        style={{
          willChange: "transform, opacity",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
