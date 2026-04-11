import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

export const BasicSelect = ({
  value,
  onValueChange,
  items,
  placeholder,
  isLoading,
  bindValue,
  bindLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: any[];
  placeholder: string;
  isLoading?: boolean;
  bindValue: string;
  bindLabel: string;
  className?: string;
}) => {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={isLoading}>
      <SelectTrigger isLoading={isLoading} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items?.map((item) => (
          <SelectItem key={item[bindValue]} value={item[bindValue]}>
            {item[bindLabel]}
          </SelectItem>
        ))}
        {items?.length === 0 && (
          <SelectItem disabled value="no-items">
            No Data
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
};
