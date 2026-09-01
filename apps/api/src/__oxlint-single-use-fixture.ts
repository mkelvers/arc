function timestamp(value: Date | null) {
    return value?.toISOString() ?? null;
}

timestamp(new Date());
